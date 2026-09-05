# Gate 7 browser security

The Next.js 15 application now renders each HTML response dynamically with its
own cryptographically random 256-bit nonce. `apps/web/middleware.ts` sends the
same enforced Content Security Policy to the renderer and the browser, replacing
any caller-supplied CSP or `x-nonce`. The root layout requires that nonce and
disables static rendering and ISR. Document responses set `Cache-Control` and
`CDN-Cache-Control` to `no-store`; a CDN must never cache or reuse this HTML.

This follows the version-specific
[Next.js 15 CSP guide](https://nextjs.org/docs/15/app/guides/content-security-policy)
and [middleware contract](https://nextjs.org/docs/15/app/api-reference/file-conventions/middleware).
The installed Next 15.5.25 implementation was also inspected: it extracts the
nonce from the request CSP and passes it into its framework-script rendering.
This implementation uses `middleware.ts`, without the Next 16 `proxy` convention.

## Policy and environment

Production scripts require the response nonce and use `strict-dynamic`; neither
`unsafe-inline` nor `unsafe-eval` is enabled. Inline event handlers, objects,
frames, base tags and workers are blocked. Stylesheets are same-origin or
nonced; inline style attributes are blocked. Current application styling uses
the committed stylesheet. Images may use same-origin, data or blob URLs; fonts
are same-origin. No external analytics or third-party script origins are added.

The middleware covers HTML, React Server Component navigation and prefetch
requests. Sending a client-controlled prefetch header does not bypass it.
Versioned framework assets under `_next/static`, image optimization and the
favicon are excluded from dynamic document processing.

| Setting | Purpose | Deployment requirement |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | Existing browser API base URL, also the source of the exact CSP connection origin | Set the intended HTTPS API URL before building the web application; the existing local fallback is `http://localhost:4000/v1` |
| `NEXT_PUBLIC_EVIDENCE_UPLOAD_ORIGIN` | Exact object-storage origin used by direct signed evidence PUTs | Set the HTTPS origin returned by the configured storage upload service, without a bucket path, query, credentials or wildcard |

These public settings are incorporated into the web build. Rebuild when changing
them; changing only a running container's environment does not replace browser
bundle configuration. A non-HTTPS service is accepted in production-mode tests
only when both the web request and service host are literal loopback hosts.
Malformed or insecure service configuration returns a generic 503 with a closed
CSP, never the configured URL or secret material. An absent production upload
origin deliberately leaves storage outside `connect-src`; direct uploads then
remain blocked until the deployment config supplies the real origin.

Development retains the local MinIO origin `http://localhost:9000`, the same-origin
WebSocket connection used by hot reload, and the development-only eval/style
permissions documented by Next. They are absent from production CSP.

Other document headers disable framing, MIME sniffing, cross-origin opening and
cross-origin resource embedding; suppress referrers; and disable camera,
microphone, geolocation, payment and USB permissions. HTTPS production responses
also include one-year HSTS and `upgrade-insecure-requests`. The TLS edge must
retain these headers and enforce HTTPS; this repository change does not configure
a real domain or CDN. `includeSubDomains` and HSTS preload are intentionally not
asserted before all domain ownership and routing have been reviewed.

## Production browser checks

`test/integration/web-security.test.cjs` requires the isolated GitHub Actions
environment. It launches the already-built production Next server on an ephemeral
loopback port and real headless Chromium, and stops both afterwards. Missing
builds, server startup, browsers or checks fail the suite; there are no skips.
It must run after the production web build and browser installation, with the
same loopback `NEXT_PUBLIC_API_URL` configuration used for that build.

The five scenarios verify:

1. Operator and capability pages have matching nonces on all rendered framework
   scripts and enforced CSP/no-store/security headers.
2. Repeated requests receive distinct nonces, and supplied nonce/CSP/prefetch
   headers cannot select or bypass the document policy.
3. `connect-src` contains only the application and explicitly configured service
   origins.
4. A real production page hydrates, handles form state and a submit click, makes
   its API request, renders the result, navigates through Next's client router
   and handles file selection without any CSP violation or page exception.
5. Chromium blocks deliberately inserted, unnonced inline script and inline
   event-handler code while the existing capability page hydrates normally.

The form test intercepts API responses with synthetic fixtures, so it proves
browser/CSP behavior rather than server authentication or persistence. Separate
API integration suites prove those boundaries. It does not submit anything to a
live provider or upload evidence. See the Gate 7 report and current CI revision
for actual execution evidence. The middleware/layout were typechecked locally;
no local web service was started during implementation.

Full-page production OIDC sign-in, target IdP redirects, storage uploads with the
real configured origin, proxy behavior, browser compatibility outside Chromium,
and an independent penetration test still require target-environment evidence.
Future popup-based authentication must review the opener policy explicitly.
Adding CSP does not replace output escaping, access checks or tenant isolation.
