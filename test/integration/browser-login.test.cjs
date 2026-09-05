'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID, randomBytes, createHash } = require('node:crypto');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const { createServer } = require('node:net');
const { resolve, dirname, join } = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');
const { createHttpsProxy, createOidcIssuer } = require('../fixtures/browser-oidc.cjs');

// These real browser/TLS/OIDC exchanges exercise the application and SDK with a
// synthetic issuer. They do not attest to a provisioned or live Auth0 tenant.

const root = resolve(__dirname, '../..');
const tenants = { A: randomUUID(), B: randomUUID() }, models = {}, sessions = {}, children = [], contexts = [];
const clientId = 'eubp-browser-protocol-fixture';
const clientSecret = randomBytes(32).toString('hex'), sessionSecret = randomBytes(32).toString('hex');
const audience = 'eubp-browser-api';
let issuer, apiProxy, webProxy, browser, cookieCodec;

async function unusedPort() {
  const server = createServer(); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const port = server.address().port; await new Promise(resolve => server.close(resolve)); return port;
}

async function start(args, env, readiness) {
  const child = { logs: '', process: spawn(process.execPath, args, {
    cwd: root, env: { ...process.env, ...env, NODE_TEST_CONTEXT: undefined }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
  }) };
  children.push(child);
  child.process.stdout.on('data', data => { child.logs = (child.logs + data).slice(-12000); });
  child.process.stderr.on('data', data => { child.logs = (child.logs + data).slice(-12000); });
  let lastReadiness = { status: null, body: '', cause: '' }, deterministicFailures = 0;
  for (let attempt = 0; attempt < 180; attempt++) {
    if (child.process.exitCode !== null || child.process.signalCode !== null) throw new Error(`Browser fixture service exited: ${child.logs}`);
    try {
      const response = await fetch(readiness, { signal: AbortSignal.timeout(1000) });
      if (response.ok) return child;
      const text = await response.text();
      // Readiness happens before login. Print only explicitly safe application
      // diagnostics, never arbitrary provider bodies, tokens or configuration.
      let body = '[response body omitted]';
      try {
        const data = JSON.parse(text);
        if (typeof data.configured === 'boolean' && typeof data.authenticated === 'boolean') {
          body = JSON.stringify({ configured: data.configured, authenticated: data.authenticated });
        } else if (data.message === 'Request origin is not allowed.') body = data.message;
      } catch {
        if (text === 'Web security configuration is incomplete.' || text === 'Fixture upstream unavailable') body = text;
      }
      lastReadiness = { status: response.status, body: body.slice(0, 200), cause: '' };
      deterministicFailures = [403, 503].includes(response.status) ? deterministicFailures + 1 : 0;
    } catch (error) {
      const code = error?.cause?.code || error?.code;
      lastReadiness = { status: null, body: '', cause: typeof code === 'string' && /^[A-Z0-9_]{1,80}$/.test(code) ? code : 'REQUEST_FAILED' };
      deterministicFailures = 0;
    }
    if (deterministicFailures >= 6) throw new Error(`Browser fixture readiness rejected: ${JSON.stringify(lastReadiness)}; logs=${child.logs}`);
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error(`Browser fixture service unavailable: ${JSON.stringify(lastReadiness)}; logs=${child.logs}`);
}

async function context() {
  const value = await browser.newContext();
  contexts.push(value);
  return value;
}

async function cookieHeader(ctx) {
  return (await ctx.cookies(webProxy.origin)).map(cookie => `${cookie.name}=${cookie.value}`).join('; ');
}

async function request(ctx, path, { method = 'GET', body, headers = {}, redirect = 'manual' } = {}) {
  const response = await fetch(webProxy.origin + path, { method, redirect,
    headers: { ...(ctx ? { cookie: await cookieHeader(ctx) } : {}), ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...headers },
    body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(20000) });
  const text = await response.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  return { status: response.status, response, data, text };
}

async function api(actor, path, body) {
  const response = await fetch(apiProxy.origin + '/v1' + path, { method: body === undefined ? 'GET' : 'POST',
    headers: { authorization: `Bearer ${await issuer.accessToken(actor)}`, 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await response.json();
  assert([200, 201].includes(response.status), `Fixture API ${path}: ${JSON.stringify(data)}`);
  return data;
}

async function login(ctx, actor = 'A', { fault, callbackTransform, stopAtCallback = false } = {}) {
  issuer.setNextFault({ ...fault, callbackTransform, holdCallback: stopAtCallback });
  const page = await ctx.newPage();
  const requestIndex = webProxy.requests.length, callbackIndex = issuer.events.callbacks.length;
  const signIn = await page.goto(webProxy.origin + '/auth/login');
  assert.equal(signIn.status(), 200, `Issuer authorization page: ${await signIn.text()}`);
  const transactionCookies = (await ctx.cookies(webProxy.origin)).filter(cookie => cookie.name.startsWith('__Host-eubp_txn_'));
  assert.equal(transactionCookies.length, 1);
  const callbackPromise = stopAtCallback ? undefined : page.waitForResponse(response => new URL(response.url()).origin === webProxy.origin
    && new URL(response.url()).pathname === '/auth/callback', { timeout: 20000 });
  const choicePromise = page.waitForResponse(response => new URL(response.url()).origin === new URL(issuer.issuer).origin
    && new URL(response.url()).pathname === '/fixture/choose' && response.request().method() === 'POST', { timeout: 20000 });
  await page.getByRole('button', { name: `Choose tenant ${actor}`, exact: true }).click();
  const choice = await choicePromise;
  const issuedCallback = issuer.events.callbacks[callbackIndex];
  assert(issuedCallback, 'The real issuer must record the selected account callback');
  if (stopAtCallback) {
    assert.equal(choice.status(), 200); assert.equal(issuedCallback.held, true);
    assert.equal(issuedCallback.deliveredUrl, null);
    assert(!webProxy.requests.slice(requestIndex).some(entry => new URL(entry.url, webProxy.origin).pathname === '/auth/callback'),
      'A held code must not reach the application or be exchanged');
    return { page, callbackUrl: new URL(issuedCallback.originalUrl), transactionCookies };
  }
  const callback = await callbackPromise;
  assert.equal(choice.status(), 303);
  const callbackUrl = new URL(issuedCallback.deliveredUrl);
  assert(webProxy.requests.slice(requestIndex).some(entry => entry.method === 'GET' && entry.url === callbackUrl.pathname + callbackUrl.search),
    'The browser must deliver the exact issuer callback, including deliberate state/code changes, to the web proxy');
  if (callbackTransform) assert(issuedCallback.deliveredUrl !== issuedCallback.originalUrl, 'A negative flow must actually modify the callback');
  if (callback.status() === 303) await page.waitForURL(webProxy.origin + '/dashboard');
  return { page, callback, callbackUrl, transactionCookies };
}

async function successfulLogin(ctx, actor = 'A', options) {
  const result = await login(ctx, actor, options);
  if (result.callback.status() !== 303) {
    assert.fail(`Callback failed: ${await result.callback.text()}; logs=${children.map(child => child.logs).join('\n')}`);
  }
  return result;
}

function sessionCookies(cookies) {
  return cookies.filter(cookie => cookie.name === '__Host-eubp_session' || /^__Host-eubp_session__\d+$/.test(cookie.name))
    .sort((a, b) => a.name.localeCompare(b.name));
}

async function setSessionCookie(ctx, value) {
  const chunks = value.match(/.{1,3500}/g);
  await ctx.addCookies(chunks.map((part, index) => ({
    name: '__Host-eubp_session' + (chunks.length > 1 ? `__${index}` : ''), value: part,
    url: webProxy.origin, secure: true, httpOnly: true, sameSite: 'Lax',
  })));
}

before(async () => {
  assert.equal(process.env.GITHUB_ACTIONS, 'true');
  assert(process.env.NODE_EXTRA_CA_CERTS && process.env.TEST_BROWSER_TLS_DIRECTORY, 'CI must prepare actual certificate trust');
  assert.notEqual(process.env.NODE_TLS_REJECT_UNAUTHORIZED, '0');
  const [apiPort, webPort] = await Promise.all([unusedPort(), unusedPort()]);
  issuer = await createOidcIssuer({ clientId, clientSecret, audience, tenants });
  apiProxy = await createHttpsProxy(`http://127.0.0.1:${apiPort}`);
  webProxy = await createHttpsProxy(`http://127.0.0.1:${webPort}`);
  issuer.setAppOrigin(webProxy.origin);
  await start(['apps/api/dist/main.js'], {
    NODE_ENV: 'production', AUTH_MODE: 'oidc', PORT: String(apiPort),
    OIDC_ISSUER: issuer.issuer, OIDC_JWKS_URL: issuer.jwksUrl, OIDC_AUDIENCE: audience,
    OIDC_ORGANISATION_CLAIM: 'https://eubatterypassport.nl/organisation_id',
    OIDC_ROLE_CLAIM: 'https://eubatterypassport.nl/role', OIDC_ALLOWED_ALGORITHMS: 'RS256',
    RESOLVER_BASE_URL: 'https://id.example.invalid/b', WEB_ORIGIN: webProxy.origin,
    SUPPLIER_PORTAL_BASE_URL: webProxy.origin + '/supplier', RESTRICTED_ACCESS_BASE_URL: webProxy.origin + '/access',
    MALWARE_SCANNER: 'clamav', CLAMAV_HOST: '127.0.0.1', CLAMAV_PORT: '53310',
    BATTERY_SEMANTIC_CATALOGUE_AVAILABLE: 'false', REGISTRY_BATTERY_SUBMISSION_AVAILABLE: 'false',
  }, apiProxy.origin + '/v1/health');
  for (const actor of ['A', 'B']) {
    await api(actor, '/organisations/bootstrap', { legalName: `Browser login ${actor}`, countryCode: 'NL', role: 'responsible_economic_operator' });
    models[actor] = await api(actor, '/battery-models', { modelIdentifier: `browser-private-${actor}-${randomUUID()}`, category: 'EV' });
  }
  await start(['node_modules/next/dist/bin/next', 'start', 'apps/web', '-H', '127.0.0.1', '-p', String(webPort)], {
    NODE_ENV: 'production', NEXT_TELEMETRY_DISABLED: '1',
    AUTH0_DOMAIN: issuer.issuer, AUTH0_CLIENT_ID: clientId, AUTH0_CLIENT_SECRET: clientSecret,
    AUTH0_SECRET: sessionSecret, AUTH0_AUDIENCE: audience, APP_BASE_URL: webProxy.origin,
    OIDC_ISSUER: issuer.issuer, OIDC_AUDIENCE: audience, API_BASE_URL: apiProxy.origin + '/v1',
  }, webProxy.origin + '/api/session');
  browser = await chromium.launch({ headless: true });
  cookieCodec = await import(pathToFileURL(join(dirname(require.resolve('@auth0/nextjs-auth0/server')), 'cookies.js')).toString());
  for (const actor of ['A', 'B']) {
    sessions[actor] = { context: await context() };
    Object.assign(sessions[actor], await successfulLogin(sessions[actor].context, actor));
  }
}, { timeout: 180000 });

after(async () => {
  await browser?.close();
  for (const child of children) {
    if (child.process.exitCode === null && child.process.signalCode === null) {
      const stopped = once(child.process, 'exit'); child.process.kill(); await stopped;
    }
  }
  await webProxy?.close(); await apiProxy?.close(); await issuer?.close();
});

test('Browser login: genuine HTTPS authorization-code flows enforce state, nonce, PKCE S256 and confidential client authentication', async () => {
  assert.equal(new URL(issuer.issuer).hostname, 'eubp-oidc.example.invalid');
  assert.equal(new URL(issuer.issuer).port, '');
  assert.equal(new URL(webProxy.origin).hostname, '127.0.0.1');
  assert.equal(issuer.events.authorization.length, 2);
  assert.equal(issuer.events.exchanges.length, 2);
  assert(issuer.events.jwks > 0, 'Real API verification must fetch the HTTPS issuer JWKS');
  assert.deepEqual(issuer.events.applicationCookieLeaks, [], 'Application session/transaction cookies must never reach the issuer site');
  const [first, second] = issuer.events.authorization;
  assert.notEqual(first.state, second.state); assert.notEqual(first.nonce, second.nonce);
  assert.notEqual(first.code_challenge, second.code_challenge);
  for (let index = 0; index < 2; index++) {
    const authorization = issuer.events.authorization[index], exchange = issuer.events.exchanges[index];
    assert.equal(exchange.grant_type, 'authorization_code'); assert.equal(exchange.client_id, clientId);
    assert.equal(exchange.client_secret, clientSecret); assert.equal(exchange.authorization, undefined);
    assert.equal(createHash('sha256').update(exchange.code_verifier).digest('base64url'), authorization.code_challenge);
    assert.equal(authorization.scope.includes('offline_access'), false);
  }
});

test('Browser login: the browser receives only Secure HttpOnly host-only session cookies and a minimal session profile', async () => {
  for (const actor of ['A', 'B']) {
    const { context: ctx, page, transactionCookies } = sessions[actor];
    const cookies = await ctx.cookies(webProxy.origin), encrypted = sessionCookies(cookies);
    assert(encrypted.length > 0);
    for (const cookie of [...encrypted, ...transactionCookies]) {
      assert.equal(cookie.httpOnly, true); assert.equal(cookie.secure, true); assert.equal(cookie.sameSite, 'Lax');
      assert.equal(cookie.path, '/'); assert.equal(cookie.domain, '127.0.0.1');
    }
    assert.equal(cookies.some(cookie => cookie.name.startsWith('__Host-eubp_txn_')), false);
    const response = await request(ctx, '/api/session');
    assert.equal(response.status, 200);
    assert.deepEqual(response.data, { configured: true, authenticated: true, name: `Synthetic tenant ${actor}` });
    assert.match(response.response.headers.get('cache-control'), /no-store/);
    const visible = await page.evaluate(() => ({ cookie: document.cookie, local: { ...localStorage }, session: { ...sessionStorage }, html: document.documentElement.outerHTML }));
    assert(!visible.cookie.includes('__Host-eubp_'));
    for (const entry of issuer.codes.values()) {
      if (!entry.issued) continue;
      for (const token of Object.values(entry.issued)) assert(!JSON.stringify(visible).includes(token));
    }
    assert(!JSON.stringify(visible).includes(clientSecret));
  }
});

test('Browser login: unauthenticated requests and forged browser/local-storage bearer tokens cannot create a session', async () => {
  const ctx = await context(), page = await ctx.newPage(), forged = await issuer.accessToken('B');
  await ctx.addInitScript(token => { localStorage.setItem('eubp_token', token); localStorage.setItem('eubp_acting_org', 'forged'); }, forged);
  await page.goto(webProxy.origin + '/suppliers');
  const result = await page.evaluate(async token => {
    const response = await fetch('/api/backend/organisations/current', { headers: { authorization: `Bearer ${token}` } });
    return { status: response.status, data: await response.json() };
  }, forged);
  assert.equal(result.status, 401);
  assert(!JSON.stringify(result).includes(forged));
  assert.deepEqual((await request(ctx, '/api/session')).data, { configured: true, authenticated: false });
});

test('Browser login: the BFF injects the session token and drops browser credentials and forwarding headers', async () => {
  const ctx = sessions.A.context, forged = await issuer.accessToken('B');
  const response = await request(ctx, '/api/backend/organisations/current', { headers: {
    authorization: `Bearer ${forged}`, 'x-forwarded-for': '203.0.113.99', 'x-supplier-token': 'untrusted-capability',
  } });
  assert.equal(response.status, 200); assert.equal(response.data.id, tenants.A);
  const upstream = apiProxy.requests.findLast(entry => entry.url === '/v1/organisations/current');
  assert(upstream.headers.authorization.startsWith('Bearer '));
  assert.notEqual(upstream.headers.authorization, `Bearer ${forged}`);
  assert.equal(upstream.headers.cookie, undefined); assert.equal(upstream.headers['x-supplier-token'], undefined);
  assert.equal(upstream.headers['x-forwarded-for'], undefined);
});

test('Browser login: independent browser sessions retain real API tenant isolation and written-authorisation gates', async () => {
  for (const actor of ['A', 'B']) {
    const other = actor === 'A' ? 'B' : 'A', ctx = sessions[actor].context;
    const listed = await request(ctx, '/api/backend/battery-models');
    assert.equal(listed.status, 200); assert.deepEqual(listed.data.map(model => model.id), [models[actor].id]);
    assert.equal((await request(ctx, '/api/backend/battery-models/' + models[other].id)).status, 404);
    assert.equal((await request(ctx, '/api/backend/organisations/current', { headers: { 'x-acting-organisation-id': tenants[other] } })).status, 403);
    assert.equal((await request(ctx, '/api/backend/battery-items', { method: 'POST', headers: { origin: webProxy.origin },
      body: { modelId: models[other].id, organisationId: tenants[other], serialOrItemIdentifier: randomUUID() } })).status, 404);
  }
});

test('Browser login: a real signed-in browser creates a supplier through the BFF without exposing access tokens', async () => {
  const page = sessions.A.page, seen = [];
  const listener = req => seen.push({ url: req.url(), authorization: req.headers().authorization });
  page.on('request', listener);
  try {
    await page.goto(webProxy.origin + '/suppliers');
    const name = `Browser-created supplier ${randomUUID()}`;
    await page.getByPlaceholder('Cell / pack supplier').fill(name);
    await page.getByRole('button', { name: 'Add supplier', exact: true }).click();
    await page.getByText(name, { exact: true }).waitFor();
    assert(seen.some(req => req.url === webProxy.origin + '/api/backend/suppliers'));
    assert(seen.every(req => !req.authorization));
    assert(seen.every(req => !req.url.startsWith(apiProxy.origin)));
    assert((await api('A', '/suppliers')).some(supplier => supplier.legalName === name));
    assert(!(await api('B', '/suppliers')).some(supplier => supplier.legalName === name));
  } finally { page.off('request', listener); }
});

test('Browser login: cookie-authenticated mutations reject missing, foreign and null Origin before reaching the API', async () => {
  const beforeCount = apiProxy.requests.length;
  for (const origin of [undefined, 'https://attacker.example.invalid', 'null']) {
    const result = await request(sessions.A.context, '/api/backend/suppliers', { method: 'POST',
      headers: origin === undefined ? {} : { origin }, body: { legalName: 'CSRF must not create this', countryCode: 'NL' } });
    assert.equal(result.status, 403);
  }
  assert.equal(apiProxy.requests.length, beforeCount);
});

test('Browser login: BFF route restrictions and disabled SDK token/profile endpoints cannot disclose credentials', async () => {
  for (const path of ['/auth/access-token', '/auth/profile', '/auth/connect', '/api/backend/auth/dev-token', '/api/backend/health', '/api/backend/unknown']) {
    const response = await request(sessions.A.context, path);
    assert.equal(response.status, 404, path);
  }
});

test('Browser login: login parameter overrides and GET/cross-origin logout are rejected without clearing a valid session', async () => {
  for (const query of ['?returnTo=https://attacker.example.invalid', '?audience=other', '?scope=offline_access']) {
    assert.equal((await request(sessions.A.context, '/auth/login' + query)).status, 400);
  }
  assert.equal((await request(sessions.A.context, '/auth/logout')).status, 405);
  for (const origin of [undefined, 'https://attacker.example.invalid', 'null']) {
    assert.equal((await request(sessions.A.context, '/auth/logout', { method: 'POST',
      headers: { accept: 'application/json', ...(origin === undefined ? {} : { origin }) } })).status, 403);
  }
  assert.equal((await request(sessions.A.context, '/api/session')).data.authenticated, true);
});

test('Browser login: missing or altered state and a replayed callback cannot establish another session', async () => {
  for (const mutation of [url => { url.searchParams.delete('state'); return url; }, url => { url.searchParams.set('state', randomBytes(32).toString('base64url')); return url; }]) {
    const ctx = await context(), beforeCount = issuer.events.exchanges.length;
    const flow = await login(ctx, 'A', { callbackTransform: mutation });
    assert.equal(flow.callback.status(), 400); assert.equal(issuer.events.exchanges.length, beforeCount);
    assert.equal((await request(ctx, '/api/session')).data.authenticated, false);
  }
  const replay = await request(sessions.A.context, sessions.A.callbackUrl.pathname + sessions.A.callbackUrl.search);
  assert.equal(replay.status, 400);
  assert(!replay.text.includes(sessions.A.callbackUrl.searchParams.get('code')));
});

test('Browser login: a code from another browser transaction fails PKCE verification', async () => {
  const first = await context(), second = await context();
  const intercepted = await login(first, 'A', { stopAtCallback: true });
  const exchanged = await login(second, 'B', { callbackTransform: url => {
    url.searchParams.set('code', intercepted.callbackUrl.searchParams.get('code')); return url;
  } });
  assert.equal(exchanged.callback.status(), 400);
  assert.equal((await request(second, '/api/session')).data.authenticated, false);
  assert.equal(issuer.codes.get(intercepted.callbackUrl.searchParams.get('code')).used, false);
});

test('Browser login: wrong ID-token nonce, audience, issuer and expiry fail with a generic error', async () => {
  for (const idClaims of [{ nonce: 'incorrect-nonce' }, { aud: 'wrong-client' },
    { iss: issuer.issuer + 'different' }, { exp: Math.floor(Date.now() / 1000) - 120 }]) {
    const ctx = await context(), result = await login(ctx, 'A', { fault: { idClaims } });
    assert.equal(result.callback.status(), 400);
    assert.equal(await result.callback.text(), 'Sign-in failed. Please try again.');
    assert.equal((await request(ctx, '/api/session')).data.authenticated, false);
  }
});

test('Browser login: a token endpoint outage cannot create a browser session or expose provider errors', async () => {
  const ctx = await context(), result = await login(ctx, 'A', { fault: { tokenError: true } });
  assert.equal(result.callback.status(), 400);
  assert.equal(await result.callback.text(), 'Sign-in failed. Please try again.');
  assert.equal((await request(ctx, '/api/session')).data.authenticated, false);
});

test('Browser login: missing provisioned organisation or role claims cannot create an operator session', async () => {
  for (const missing of ['https://eubatterypassport.nl/organisation_id', 'https://eubatterypassport.nl/role']) {
    const ctx = await context(), result = await login(ctx, 'A', { fault: { idClaims: { [missing]: undefined } } });
    assert.equal(result.callback.status(), 400);
    assert.equal(await result.callback.text(), 'Sign-in failed. Please try again.');
    assert.equal(sessionCookies(await ctx.cookies(webProxy.origin)).length, 0);
    assert.equal((await request(ctx, '/api/session')).data.authenticated, false);
    await ctx.close();
  }
});

test('Browser login: tampered and expired encrypted sessions are rejected while a real login remains valid', async () => {
  const original = sessionCookies(await sessions.A.context.cookies(webProxy.origin));
  const encoded = original.map(cookie => cookie.value).join('');
  const decrypted = await cookieCodec.decrypt(encoded, sessionSecret);
  assert(decrypted, 'Start with a session created by a real authorization-code flow');
  // Advance only this synthetic cookie's expiry using the fixture secret. This
  // exercises SDK expiry checks without weakening production durations or waiting an hour.
  const expired = await cookieCodec.encrypt(decrypted.payload, sessionSecret, Math.floor(Date.now() / 1000) - 60);
  for (const value of [encoded.slice(0, -8) + 'tampered', expired]) {
    const ctx = await context();
    await setSessionCookie(ctx, value);
    assert.equal((await request(ctx, '/api/session')).data.authenticated, false);
    assert.equal((await request(ctx, '/api/backend/organisations/current')).status, 401);
  }
  assert.equal((await request(sessions.A.context, '/api/session')).data.authenticated, true);
});

test('Browser login: expired access tokens require a fresh login and never trigger an offline refresh', async () => {
  const ctx = await context(); await successfulLogin(ctx, 'A', { fault: { expiresIn: 3 } });
  await new Promise(resolve => setTimeout(resolve, 4100));
  const beforeCount = issuer.events.exchanges.length;
  assert.equal((await request(ctx, '/api/session')).data.authenticated, false);
  assert.equal((await request(ctx, '/api/backend/organisations/current')).status, 401);
  assert.equal(issuer.events.exchanges.length, beforeCount);
});

test('Browser login: same-origin POST logout clears the browser session and performs OIDC logout without token URLs', async () => {
  const ctx = await context(), flow = await successfulLogin(ctx, 'A');
  const [logout] = await Promise.all([
    flow.page.waitForResponse(response => new URL(response.url()).pathname === '/auth/logout' && response.request().method() === 'POST'),
    flow.page.getByRole('button', { name: 'Sign out', exact: true }).click(),
  ]);
  assert.equal(logout.status(), 200);
  const result = await logout.json();
  assert.deepEqual(Object.keys(result), ['redirectTo']);
  const redirect = new URL(result.redirectTo);
  assert.equal(redirect.origin, new URL(issuer.issuer).origin);
  assert.equal(redirect.pathname, '/oidc/logout');
  assert.equal(redirect.searchParams.has('id_token_hint'), false);
  const logoutHeaders = await logout.request().allHeaders();
  assert.equal(logoutHeaders.origin, webProxy.origin);
  assert.equal(logoutHeaders.referer, undefined);
  await flow.page.getByRole('link', { name: 'Sign in', exact: true }).waitFor();
  assert.equal((await request(ctx, '/api/session')).data.authenticated, false);
  assert.equal(sessionCookies(await ctx.cookies(webProxy.origin)).length, 0);
  assert(issuer.events.logout.length > 0);
  assert.equal((await request(ctx, '/api/backend/organisations/current')).status, 401);
  assert.deepEqual(issuer.events.unexpected, []);
  assert.deepEqual(issuer.events.applicationCookieLeaks, []);
});
