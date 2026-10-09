'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { createServer } = require('node:http');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const { resolve } = require('node:path');
const { chromium } = require('playwright');
const { fields } = require('@eubp/rules');
const { createHttpsProxy } = require('../fixtures/browser-oidc.cjs');

// The public API fixture exercises only rendering, projection and browser/TLS
// transport. Real snapshot/RLS/publication behavior has its own API suites.
const root = resolve(__dirname, '../..');
const id = '0a5f3e60-e216-43d2-9f86-d6024820f3a1';
const missingId = '35448174-e11b-493b-8c3f-d7242826e705';
const publicField = fields.find(field => field.access_tier === 'public');
const snapshot = {
  schema: 'eubatterypassport.v2', ruleSetVersion: 'EU-BR-2026.08', generatedAt: '2026-10-09T10:00:00.000Z',
  organisationId: 'restricted-organisation-marker', canonicalJson: { secret: 'restricted-canonical-marker' },
  registered: true, registryIdentifier: 'restricted-registry-marker',
  battery: { publicId: id, modelIdentifier: 'PUBLIC-SCAN-MODEL', serial: 'PUBLIC-SCAN-SERIAL',
    id: 'restricted-item-marker', modelId: 'restricted-model-marker', lifecycleStatus: 'restricted-lifecycle-marker' },
  values: [{ fieldId: publicField.id, name: 'forged-name-marker', value: '<script>window.__publicPassportInjected=true</script>',
    evidenceIds: ['restricted-evidence-marker'] },
    ...Array.from({ length: 6 }, (_, index) => ({ fieldId: 45 + index, accessTier: 'public', value: `restricted-field-marker-${45 + index}` }))],
};
let fixtureServer, apiProxy, webProxy, web, browser, logs = '', upstreamMode = 'ok';

async function loopback(server) {
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  return `http://127.0.0.1:${server.address().port}`;
}

before(async () => {
  assert.equal(process.env.GITHUB_ACTIONS, 'true', 'Public browser acceptance runs only in isolated GitHub Actions');
  assert(process.env.TEST_BROWSER_TLS_DIRECTORY, 'The runner must supply its existing ephemeral trusted TLS fixture');
  fixtureServer = createServer((request, response) => {
    const publicPath = `/v1/public/b/${id}`;
    if (request.method !== 'GET' || !request.url.startsWith('/v1/public/b/')) { response.writeHead(400).end(); return; }
    if (request.url !== publicPath) { response.writeHead(404, { 'content-type': 'application/json' }).end('{"code":"PUBLIC_PASSPORT_NOT_FOUND"}'); return; }
    if (upstreamMode === 'offline') { request.socket.destroy(); return; }
    if (upstreamMode === 'redirect') { response.writeHead(302, { location: publicPath }).end(); return; }
    if (upstreamMode === 'invalid') { response.writeHead(200, { 'content-type': 'application/json' }).end('{invalid-json'); return; }
    response.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' }).end(JSON.stringify(snapshot));
  });
  const apiOrigin = await loopback(fixtureServer);
  apiProxy = await createHttpsProxy(apiOrigin);
  const reservation = createServer();
  const internalWeb = await loopback(reservation);
  await new Promise(resolve => reservation.close(resolve));
  webProxy = await createHttpsProxy(internalWeb);
  const env = { ...process.env, NODE_ENV: 'production', NEXT_TELEMETRY_DISABLED: '1',
    APP_BASE_URL: webProxy.origin, API_BASE_URL: apiProxy.origin + '/v1', AUTH0_DOMAIN: '', AUTH0_CLIENT_ID: '',
    AUTH0_CLIENT_SECRET: '', AUTH0_SECRET: '', NODE_TEST_CONTEXT: undefined };
  web = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', 'apps/web', '-H', '127.0.0.1', '-p', new URL(internalWeb).port],
    { cwd: root, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  web.stdout.on('data', data => { logs = (logs + data).slice(-16000); });
  web.stderr.on('data', data => { logs = (logs + data).slice(-16000); });
  let ready = false;
  for (let attempt = 0; attempt < 120; attempt++) {
    if (web.exitCode !== null) throw new Error(`Public viewer fixture exited: ${logs}`);
    try {
      const response = await fetch(webProxy.origin + '/b/' + id, { signal: AbortSignal.timeout(1000) });
      if (response.ok && (await response.text()).includes('PUBLIC-SCAN-MODEL')) { ready = true; break; }
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  assert(ready, `Public viewer did not become ready: ${logs}`);
  browser = await chromium.launch({ headless: true });
}, { timeout: 60000 });

after(async () => {
  try { await browser?.close(); } finally {
    if (web && web.exitCode === null) { const stopped = once(web, 'exit'); web.kill(); await stopped; }
    await webProxy?.close();
    await apiProxy?.close();
    if (fixtureServer?.listening) { fixtureServer.closeAllConnections(); await new Promise(resolve => fixtureServer.close(resolve)); }
  }
});

test('public scan works anonymously on mobile and desktop and never forwards browser credentials', async () => {
  const initialRequests = apiProxy.requests.length;
  for (const width of [390, 1440]) {
    const context = await browser.newContext({ viewport: { width, height: 900 },
      extraHTTPHeaders: { authorization: 'Bearer forged-browser-marker', 'x-supplier-token': 'forged-supplier-marker' } });
    await context.addCookies([{ name: 'browser-private-marker', value: 'private-cookie-marker', url: webProxy.origin }]);
    const page = await context.newPage();
    const pageErrors = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    try {
      const response = await page.goto(webProxy.origin + '/b/' + id, { waitUntil: 'networkidle' });
      assert.equal(response.status(), 200);
      await page.getByRole('heading', { name: 'PUBLIC-SCAN-MODEL', exact: true }).waitFor();
      assert(await page.getByText('Serial number: PUBLIC-SCAN-SERIAL', { exact: true }).isVisible());
      assert(await page.getByText(publicField.name, { exact: true }).isVisible());
      assert(await page.getByText('EU-BR-2026.08', { exact: true }).isVisible());
      assert.equal(await page.evaluate(() => window.__publicPassportInjected), undefined);
      const html = await response.text();
      for (const marker of ['restricted-', 'forged-name-marker', 'forged-browser-marker', 'private-cookie-marker', 'forged-supplier-marker']) {
        assert.equal(html.includes(marker), false, marker);
      }
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false,
        `Public passport overflows at viewport width ${width}`);
      assert.match(response.headers()['cache-control'], /no-store/);
      assert.match(response.headers()['content-security-policy'], /script-src-attr 'none'/);
      assert.deepEqual(pageErrors, []);
    } finally { await context.close(); }
  }
  const upstream = apiProxy.requests.slice(initialRequests);
  assert(upstream.length >= 2);
  for (const request of upstream) {
    assert.equal(request.method, 'GET');
    assert.equal(request.url, `/v1/public/b/${id}`);
    for (const header of ['authorization', 'cookie', 'x-supplier-token', 'x-passport-access-token', 'x-acting-organisation-id']) {
      assert.equal(request.headers[header], undefined, header);
    }
  }
  assert(!webProxy.requests.some(request => request.url.startsWith('/auth/')));
});

test('invalid and missing identifiers show no passport and invalid syntax never reaches the API', async () => {
  const context = await browser.newContext(), page = await context.newPage();
  try {
    const before = apiProxy.requests.length;
    await page.goto(webProxy.origin + '/b/not-a-uuid');
    await page.getByRole('heading', { name: 'Passport not found', exact: true }).waitFor();
    assert.equal(apiProxy.requests.length, before);
    await page.goto(webProxy.origin + '/b/' + missingId);
    await page.getByRole('heading', { name: 'Passport not found', exact: true }).waitFor();
    assert.equal(await page.getByRole('heading', { name: 'PUBLIC-SCAN-MODEL', exact: true }).count(), 0);
    assert.equal(await page.getByRole('table').count(), 0);
    assert.equal(apiProxy.requests.at(-1).url, '/v1/public/b/' + missingId);
  } finally { await context.close(); }
});

test('backend failures, malformed JSON and redirects cannot show a stale or fabricated passport', async () => {
  const context = await browser.newContext(), page = await context.newPage();
  try {
    await page.goto(webProxy.origin + '/b/' + id);
    await page.getByRole('heading', { name: 'PUBLIC-SCAN-MODEL', exact: true }).waitFor();
    for (const mode of ['offline', 'invalid', 'redirect']) {
      upstreamMode = mode;
      const before = apiProxy.requests.length;
      await page.goto(webProxy.origin + '/b/' + id);
      await page.getByRole('heading', { name: 'Passport temporarily unavailable', exact: true }).waitFor();
      assert.equal(await page.getByRole('heading', { name: 'PUBLIC-SCAN-MODEL', exact: true }).count(), 0);
      assert.equal(await page.getByRole('table').count(), 0);
      if (mode === 'redirect') assert.equal(apiProxy.requests.length, before + 1, 'Public fetch must not follow redirects');
    }
  } finally { upstreamMode = 'ok'; await context.close(); }
});
