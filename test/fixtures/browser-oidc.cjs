'use strict';

const assert = require('node:assert/strict');
const { randomBytes, createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { createServer } = require('node:https');
const { request: httpRequest } = require('node:http');
const { once } = require('node:events');
const { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } = require('node:fs');
const { tmpdir, homedir } = require('node:os');
const { join, resolve, relative, isAbsolute, basename } = require('node:path');
const issuerHostname = 'eubp-oidc.example.invalid';

function command(name, args, options = {}) {
  return execFileSync(name, args, { windowsHide: true, timeout: 60000, stdio: ['ignore', 'pipe', 'pipe'], ...options });
}

// This fixture changes trust only on an ephemeral Linux GitHub runner. Its CA
// is generated per run, never committed or installed on a developer computer.
function createBrowserTrust() {
  assert.equal(process.env.GITHUB_ACTIONS, 'true', 'Browser TLS trust is restricted to isolated GitHub Actions');
  assert.equal(process.platform, 'linux', 'The browser trust fixture requires the disposable Linux runner');
  const directory = mkdtempSync(join(tmpdir(), 'eubp-browser-oidc-'));
  const identifier = `eubp-browser-${randomBytes(12).toString('hex')}`;
  const trustedPath = `/usr/local/share/ca-certificates/${identifier}.crt`;
  const nssDirectory = join(homedir(), '.pki', 'nssdb');
  let systemTrusted = false, browserTrusted = false, hostsChanged = false, portStartChanged = false;
  let originalHosts, originalPortStart;
  const replaceHosts = bytes => command('sudo', ['tee', '/etc/hosts'], { input: bytes, stdio: ['pipe', 'ignore', 'pipe'] });
  const cleanup = () => {
    const failures = [];
    const attempt = action => { try { action(); } catch (error) { failures.push(error); } };
    if (hostsChanged) attempt(() => replaceHosts(originalHosts));
    if (portStartChanged) attempt(() => command('sudo', ['sysctl', '-w', `net.ipv4.ip_unprivileged_port_start=${originalPortStart}`]));
    if (browserTrusted) attempt(() => command('certutil', ['-D', '-d', `sql:${nssDirectory}`, '-n', identifier]));
    if (systemTrusted) attempt(() => {
      assert.match(trustedPath, /^\/usr\/local\/share\/ca-certificates\/eubp-browser-[a-f0-9]{24}\.crt$/);
      command('sudo', ['rm', '--', trustedPath]);
      command('sudo', ['update-ca-certificates']);
    });
    attempt(() => {
      const inside = relative(resolve(tmpdir()), resolve(directory));
      assert(inside && !inside.startsWith('..') && !isAbsolute(inside));
      assert(basename(directory).startsWith('eubp-browser-oidc-'));
      rmSync(directory, { recursive: true, force: true });
    });
    if (failures.length) throw new AggregateError(failures, 'Isolated browser trust cleanup failed');
  };
  try {
    const openssl = args => command('openssl', args, { cwd: directory });
    openssl(['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-sha256', '-days', '2',
      '-subj', '/CN=EUBP TEST ONLY Browser OIDC CA', '-addext', 'basicConstraints=critical,CA:TRUE',
      '-addext', 'keyUsage=critical,keyCertSign,cRLSign', '-keyout', 'ca-key.pem', '-out', 'ca-cert.pem']);
    openssl(['req', '-new', '-newkey', 'rsa:2048', '-nodes', '-sha256', '-subj', '/CN=localhost',
      '-keyout', 'server-key.pem', '-out', 'server.csr']);
    writeFileSync(join(directory, 'server-extensions.cnf'), [
      'basicConstraints=critical,CA:FALSE', 'keyUsage=critical,digitalSignature,keyEncipherment',
      'extendedKeyUsage=serverAuth', `subjectAltName=IP:127.0.0.1,IP:127.0.0.2,DNS:localhost,DNS:${issuerHostname}`, '',
    ].join('\n'), { mode: 0o600 });
    openssl(['x509', '-req', '-in', 'server.csr', '-CA', 'ca-cert.pem', '-CAkey', 'ca-key.pem',
      '-CAcreateserial', '-days', '2', '-sha256', '-extfile', 'server-extensions.cnf', '-out', 'server-cert.pem']);
    command('sudo', ['install', '-m', '0644', join(directory, 'ca-cert.pem'), trustedPath]);
    systemTrusted = true;
    command('sudo', ['update-ca-certificates']);
    mkdirSync(nssDirectory, { recursive: true });
    try { command('certutil', ['-L', '-d', `sql:${nssDirectory}`]); }
    catch { command('certutil', ['-N', '--empty-password', '-d', `sql:${nssDirectory}`]); }
    command('certutil', ['-A', '-d', `sql:${nssDirectory}`, '-n', identifier, '-t', 'C,,', '-i', join(directory, 'ca-cert.pem')]);
    browserTrusted = true;
    // The production Auth0 SDK accepts DNS hosts on HTTPS/443, not an IP with
    // an ephemeral port. Keep those real constraints in this isolated fixture.
    originalHosts = readFileSync('/etc/hosts');
    hostsChanged = true;
    replaceHosts(Buffer.concat([originalHosts, Buffer.from(`\n127.0.0.2 ${issuerHostname} # ${identifier}\n`)]));
    const configuredPortStart = command('sysctl', ['-n', 'net.ipv4.ip_unprivileged_port_start']).toString().trim();
    assert.match(configuredPortStart, /^\d{1,5}$/);
    originalPortStart = Number(configuredPortStart);
    assert(originalPortStart <= 65535);
    if (originalPortStart > 443) {
      portStartChanged = true;
      command('sudo', ['sysctl', '-w', 'net.ipv4.ip_unprivileged_port_start=443']);
    }
    return { directory, caFile: join(directory, 'ca-cert.pem'), cleanup };
  } catch (error) { cleanup(); throw error; }
}

function tlsOptions() {
  assert.equal(process.env.GITHUB_ACTIONS, 'true', 'The HTTPS browser issuer runs only in isolated CI');
  const directory = process.env.TEST_BROWSER_TLS_DIRECTORY;
  assert(directory, 'The integration runner must prepare browser CA trust before launching tests');
  return { key: readFileSync(join(directory, 'server-key.pem')), cert: readFileSync(join(directory, 'server-cert.pem')) };
}

async function listen(server, hostname = '127.0.0.1', port = 0) {
  server.listen(port, hostname); await once(server, 'listening');
  return `https://${hostname}${server.address().port === 443 ? '' : ':' + server.address().port}`;
}

async function close(server) {
  if (server?.listening) {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
}

async function createHttpsProxy(target) {
  assert.equal(new URL(target).hostname, '127.0.0.1');
  const port = new URL(target).port;
  const requests = [];
  const server = createServer(tlsOptions(), (req, res) => {
    requests.push({ method: req.method, url: req.url, headers: { ...req.headers } });
    // Only the fixture's fixed internal listener is reachable. Never accept a
    // caller-controlled absolute URL as an upstream origin.
    if (!req.url.startsWith('/') || req.url.startsWith('//')) { res.writeHead(400).end(); return; }
    const forwarded = httpRequest({ protocol: 'http:', hostname: '127.0.0.1', port, path: req.url, method: req.method, headers: {
      ...req.headers, 'x-forwarded-proto': 'https', 'x-forwarded-host': req.headers.host,
    } }, upstream => {
      res.writeHead(upstream.statusCode, upstream.headers);
      upstream.pipe(res);
    });
    forwarded.on('error', () => { if (!res.headersSent) res.writeHead(502); res.end('Fixture upstream unavailable'); });
    req.pipe(forwarded);
  });
  return { origin: await listen(server), requests, close: () => close(server) };
}

async function createOidcIssuer({ clientId, clientSecret, audience, tenants }) {
  const jose = await import('jose');
  const key = await jose.generateKeyPair('RS256');
  const jwk = { ...await jose.exportJWK(key.publicKey), kid: 'browser-fixture', alg: 'RS256', use: 'sig' };
  const pending = new Map(), codes = new Map();
  const events = { authorization: [], callbacks: [], exchanges: [], logout: [], jwks: 0, unexpected: [], applicationCookieLeaks: [] };
  let issuer, appOrigin, nextFault;
  async function sign(payload) {
    return new jose.SignJWT(payload).setProtectedHeader({ alg: 'RS256', kid: jwk.kid, typ: 'JWT' }).sign(key.privateKey);
  }
  async function accessToken(actor, overrides = {}) {
    const now = Math.floor(Date.now() / 1000);
    return sign({ iss: issuer, aud: audience, sub: `browser-${actor}`,
      'https://eubatterypassport.nl/organisation_id': tenants[actor], 'https://eubatterypassport.nl/role': 'operator_admin',
      iat: now, exp: now + 600, ...overrides });
  }
  const json = (res, status, data) => res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' }).end(JSON.stringify(data));
  async function body(req) {
    let value = '';
    for await (const chunk of req) { value += chunk; if (value.length > 16384) throw new Error('Fixture request too large'); }
    return new URLSearchParams(value);
  }
  const server = createServer(tlsOptions(), (req, res) => {
    Promise.resolve().then(async () => {
      const url = new URL(req.url, issuer);
      if ((req.headers.cookie || '').split(';').some(value => value.trim().startsWith('__Host-eubp_'))) {
        events.applicationCookieLeaks.push({ method: req.method, path: url.pathname });
      }
      // Chromium may request the issuer page's default icon independently of
      // the OIDC flow. Keep this explicit asset out of protocol-error events.
      if (url.pathname === '/favicon.ico' && req.method === 'GET') {
        res.writeHead(204, { 'cache-control': 'no-store' }).end(); return;
      }
      if (url.pathname === '/.well-known/openid-configuration') return json(res, 200, {
        issuer, authorization_endpoint: issuer + 'authorize', token_endpoint: issuer + 'oauth/token',
        jwks_uri: issuer + '.well-known/jwks.json', end_session_endpoint: issuer + 'oidc/logout',
        response_types_supported: ['code'], grant_types_supported: ['authorization_code'],
        subject_types_supported: ['public'], id_token_signing_alg_values_supported: ['RS256'],
        token_endpoint_auth_methods_supported: ['client_secret_post'], code_challenge_methods_supported: ['S256'],
        scopes_supported: ['openid', 'profile', 'email'],
      });
      if (url.pathname === '/.well-known/jwks.json') { events.jwks++; return json(res, 200, { keys: [jwk] }); }
      if (url.pathname === '/authorize' && req.method === 'GET') {
        const params = Object.fromEntries(url.searchParams);
        assert.equal(params.client_id, clientId); assert.equal(params.response_type, 'code');
        assert.equal(params.redirect_uri, appOrigin + '/auth/callback'); assert.equal(params.audience, audience);
        assert.equal(params.code_challenge_method, 'S256'); assert.match(params.code_challenge, /^[A-Za-z0-9_-]{43}$/);
        assert(params.state?.length >= 32); assert(params.nonce?.length >= 32);
        assert.deepEqual(params.scope.split(' ').sort(), ['email', 'openid', 'profile']);
        const id = randomBytes(24).toString('hex');
        events.authorization.push(params); pending.set(id, { params, fault: nextFault }); nextFault = undefined;
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
        return res.end(`<html><head><title>Isolated OIDC protocol fixture</title></head><body><h1>Choose synthetic account</h1><form method="post" action="/fixture/choose"><input type="hidden" name="request" value="${id}"><button name="actor" value="A">Choose tenant A</button><button name="actor" value="B">Choose tenant B</button></form></body></html>`);
      }
      if (url.pathname === '/fixture/choose' && req.method === 'POST') {
        const fields = await body(req), selected = pending.get(fields.get('request'));
        const actor = fields.get('actor');
        if (!selected || !Object.hasOwn(tenants, actor)) return json(res, 400, { error: 'invalid_request' });
        pending.delete(fields.get('request'));
        const code = randomBytes(32).toString('base64url');
        codes.set(code, { ...selected, actor, used: false });
        const callback = new URL(selected.params.redirect_uri);
        callback.searchParams.set('code', code); callback.searchParams.set('state', selected.params.state);
        // Negative tests change the issuer's real redirect. Browser routing
        // interception does not reliably run again for a followed redirect.
        const destination = selected.fault?.callbackTransform
          ? selected.fault.callbackTransform(new URL(callback)) : callback;
        assert.equal(destination.origin, appOrigin); assert.equal(destination.pathname, '/auth/callback');
        const held = selected.fault?.holdCallback === true;
        events.callbacks.push({ originalUrl: callback.toString(), deliveredUrl: held ? null : destination.toString(), held });
        if (held) {
          res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' })
            .end('Callback held by the isolated issuer.'); return;
        }
        res.writeHead(303, { location: destination.toString(), 'cache-control': 'no-store' }).end(); return;
      }
      if (url.pathname === '/oauth/token' && req.method === 'POST') {
        const params = Object.fromEntries(await body(req));
        const entry = codes.get(params.code);
        events.exchanges.push({ ...params, authorization: req.headers.authorization });
        if (!entry || entry.used || params.client_id !== clientId || params.client_secret !== clientSecret
          || params.grant_type !== 'authorization_code' || params.redirect_uri !== entry.params.redirect_uri
          || createHash('sha256').update(params.code_verifier || '').digest('base64url') !== entry.params.code_challenge) {
          return json(res, 400, { error: 'invalid_grant' });
        }
        entry.used = true;
        if (entry.fault?.tokenError) return json(res, 503, { error: 'temporarily_unavailable' });
        const now = Math.floor(Date.now() / 1000), token = await accessToken(entry.actor, entry.fault?.accessClaims);
        const idToken = await sign({ iss: issuer, aud: clientId, sub: `browser-${entry.actor}`, iat: now, exp: now + 600,
          nonce: entry.params.nonce, sid: randomBytes(12).toString('hex'), name: `Synthetic tenant ${entry.actor}`,
          email: `browser-${entry.actor.toLowerCase()}@example.invalid`, email_verified: true,
          'https://eubatterypassport.nl/organisation_id': tenants[entry.actor], 'https://eubatterypassport.nl/role': 'operator_admin',
          ...entry.fault?.idClaims });
        entry.issued = { token, idToken };
        return json(res, 200, { access_token: token, id_token: idToken, token_type: 'Bearer',
          expires_in: entry.fault?.expiresIn ?? 600, scope: 'openid profile email' });
      }
      if (url.pathname === '/oidc/logout' && req.method === 'GET') {
        events.logout.push(Object.fromEntries(url.searchParams));
        assert.equal(url.searchParams.get('client_id'), clientId);
        assert.equal(url.searchParams.get('post_logout_redirect_uri'), appOrigin);
        assert.equal(url.searchParams.has('id_token_hint'), false, 'Logout must not disclose an ID token in URLs');
        res.writeHead(302, { location: appOrigin, 'cache-control': 'no-store' }).end(); return;
      }
      events.unexpected.push({ method: req.method, path: url.pathname });
      json(res, 404, { error: 'unsupported_fixture_endpoint' });
    }).catch(error => { events.unexpected.push({ error: error.message }); json(res, 400, { error: 'invalid_fixture_request' }); });
  });
  // A separate loopback IP is a distinct browser site and cookie host. The
  // callback must therefore work with real cross-site SameSite=Lax semantics.
  await listen(server, '127.0.0.2', 443);
  issuer = `https://${issuerHostname}/`;
  return { issuer, jwksUrl: issuer + '.well-known/jwks.json', events, codes, accessToken,
    setAppOrigin: value => { appOrigin = value; }, setNextFault: value => { nextFault = value; }, close: () => close(server) };
}

module.exports = { createBrowserTrust, createHttpsProxy, createOidcIssuer };
