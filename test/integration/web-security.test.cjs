'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const { createServer } = require('node:net');
const { resolve } = require('node:path');
const { chromium } = require('playwright');

let web, browser, base, logs = '';
const root = resolve(__dirname, '../..');
const api = new URL(process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/v1');

function documentPolicy(response) {
  assert.equal(response.status, 200);
  const policy = response.headers.get('content-security-policy');
  assert(policy, 'Missing enforced CSP');
  const nonce = /'nonce-([A-Za-z0-9+/]{43}=)'/.exec(policy)?.[1];
  assert(nonce, 'Missing 256-bit document nonce');
  assert(!policy.includes("'unsafe-inline'"));
  assert(!policy.includes("'unsafe-eval'"));
  assert(policy.includes("'strict-dynamic'"));
  for (const directive of ["object-src 'none'", "base-uri 'none'", "frame-ancestors 'none'", "script-src-attr 'none'"]) {
    assert(policy.includes(directive), directive);
  }
  assert.match(response.headers.get('cache-control'), /no-store/);
  assert.equal(response.headers.get('cdn-cache-control'), 'no-store');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(response.headers.get('x-frame-options'), 'DENY');
  assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
  assert.match(response.headers.get('permissions-policy'), /camera=\(\)/);
  return { policy, nonce };
}

async function instrumentPage() {
  const context = await browser.newContext();
  await context.addInitScript(() => {
    window.__gate7Violations = [];
    document.addEventListener('securitypolicyviolation', event => {
      window.__gate7Violations.push({ directive: event.effectiveDirective, blocked: event.blockedURI });
    });
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  return { context, page, errors };
}

before(async () => {
  assert.equal(process.env.GITHUB_ACTIONS, 'true', 'This production browser suite runs only in the isolated GitHub Actions environment');
  assert(['127.0.0.1', 'localhost', '[::1]'].includes(api.hostname), 'Browser fixtures must use a loopback API URL');
  const listener = createServer();
  listener.listen(0, '127.0.0.1');
  await once(listener, 'listening');
  const port = listener.address().port;
  await new Promise(resolve => listener.close(resolve));
  base = `http://127.0.0.1:${port}`;
  const env = { ...process.env, NODE_ENV: 'production', NEXT_TELEMETRY_DISABLED: '1' };
  delete env.NODE_TEST_CONTEXT;
  web = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', 'apps/web', '-H', '127.0.0.1', '-p', String(port)], {
    cwd: root, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
  });
  web.stdout.on('data', bytes => { logs = (logs + bytes).slice(-20000); });
  web.stderr.on('data', bytes => { logs = (logs + bytes).slice(-20000); });
  let ready = false;
  for (let attempt = 0; attempt < 120; attempt++) {
    if (web.exitCode !== null) throw new Error(`Production web server exited: ${logs}`);
    try {
      const response = await fetch(`${base}/suppliers`, { signal: AbortSignal.timeout(1000) });
      if (response.ok) { ready = true; break; }
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  assert(ready, `Production web server did not become ready: ${logs}`);
  browser = await chromium.launch({ headless: true });
}, { timeout: 60000 });

after(async () => {
  try { await browser?.close(); } finally {
    if (web && web.exitCode === null) {
      const stopped = once(web, 'exit');
      web.kill();
      await stopped;
    }
  }
});

test('Gate 7 web: operator and capability documents enforce CSP and no-store headers', async () => {
  for (const path of ['/dashboard', '/suppliers', '/supplier', '/access']) {
    const response = await fetch(base + path);
    const { nonce } = documentPolicy(response);
    const html = await response.text();
    const scripts = [...html.matchAll(/<script\b[^>]*>/g)].map(match => match[0]);
    assert(scripts.length > 0, `No framework scripts on ${path}`);
    for (const script of scripts) assert(script.includes(`nonce="${nonce}"`), `Framework script has no matching nonce: ${script}`);
  }
});

test('Gate 7 web: repeated documents receive fresh nonces and reject caller-supplied CSP/nonces', async () => {
  const first = documentPolicy(await fetch(`${base}/suppliers`));
  const secondResponse = await fetch(`${base}/suppliers`, { headers: {
    'x-nonce': 'attacker-controlled-nonce',
    'content-security-policy': "script-src 'unsafe-inline'",
    'next-router-prefetch': '1', purpose: 'prefetch',
  } });
  const second = documentPolicy(secondResponse);
  assert.notEqual(first.nonce, second.nonce);
  assert(!(await secondResponse.text()).includes('attacker-controlled-nonce'));
});

test('Gate 7 web: connect-src names only the application and explicitly configured services', async () => {
  const { policy } = documentPolicy(await fetch(`${base}/suppliers`));
  const connections = policy.split('; ').find(directive => directive.startsWith('connect-src ')).split(' ').slice(1);
  const expected = ["'self'", api.origin];
  if (process.env.NEXT_PUBLIC_EVIDENCE_UPLOAD_ORIGIN) expected.push(new URL(process.env.NEXT_PUBLIC_EVIDENCE_UPLOAD_ORIGIN).origin);
  assert.deepEqual(connections.sort(), [...new Set(expected)].sort());
  assert(!connections.some(origin => origin.includes('*')));
});

test('Gate 7 web: production hydration, API calls and client navigation work without CSP violations', async () => {
  const { context, page, errors } = await instrumentPage();
  try {
    const suppliers = [];
    let created = false;
    // These synthetic API responses isolate real browser/CSP behavior. Tenant,
    // authentication and persistence are exercised by the API integration suites.
    await page.route(`${api.origin}/**`, async route => {
      const request = route.request();
      const url = new URL(request.url());
      let body = [];
      if (url.pathname === `${api.pathname}/suppliers`) {
        if (request.method() === 'POST') {
          const input = request.postDataJSON();
          assert.equal(input.legalName, 'Gate 7 CSP supplier');
          suppliers.push({ id: 'csp-supplier', legalName: input.legalName });
          created = true;
          body = suppliers[0];
        } else body = suppliers;
      }
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body),
        headers: { 'access-control-allow-origin': base,
          'access-control-allow-methods': 'GET, POST, OPTIONS',
          'access-control-allow-headers': 'content-type, authorization, x-acting-organisation-id' } });
    });
    await page.goto(`${base}/suppliers`, { waitUntil: 'networkidle' });
    assert.equal(await page.getByRole('button', { name: 'Add supplier', exact: true }).isEnabled(), false);
    await page.getByPlaceholder('Cell / pack supplier').fill('Gate 7 CSP supplier');
    await page.getByRole('button', { name: 'Add supplier', exact: true }).click();
    await page.getByText('Gate 7 CSP supplier', { exact: true }).waitFor();
    assert.equal(created, true);
    await page.getByRole('link', { name: 'Evidence', exact: true }).click();
    await page.getByRole('heading', { name: 'Upload evidence', exact: true }).waitFor();
    await page.locator('input[type=file]').setInputFiles({ name: 'csp-fixture.txt', mimeType: 'text/plain', buffer: Buffer.from('synthetic browser fixture') });
    assert.equal(await page.getByRole('button', { name: 'Upload securely', exact: true }).isEnabled(), true);
    assert.deepEqual(errors, []);
    assert.deepEqual(await page.evaluate(() => window.__gate7Violations), []);
  } finally { await context.close(); }
});

test('Gate 7 web: the browser blocks injected inline scripts and inline event handlers', async () => {
  const { context, page } = await instrumentPage();
  try {
    await page.goto(`${base}/access`, { waitUntil: 'networkidle' });
    await page.getByText('No access token found.', { exact: true }).waitFor();
    assert.deepEqual(await page.evaluate(() => window.__gate7Violations), []);
    await page.evaluate(() => {
      const script = document.createElement('script');
      script.textContent = 'window.__gate7InjectedScript = true';
      document.body.appendChild(script);
      const button = document.createElement('button');
      button.setAttribute('onclick', 'window.__gate7InjectedHandler = true');
      document.body.appendChild(button);
      button.click();
    });
    await page.waitForFunction(() => window.__gate7Violations.length >= 2);
    const result = await page.evaluate(() => ({
      script: Boolean(window.__gate7InjectedScript), handler: Boolean(window.__gate7InjectedHandler),
      directives: window.__gate7Violations.map(violation => violation.directive),
    }));
    assert.equal(result.script, false);
    assert.equal(result.handler, false);
    assert(result.directives.includes('script-src-elem'));
    assert(result.directives.includes('script-src-attr'));
  } finally { await context.close(); }
});
