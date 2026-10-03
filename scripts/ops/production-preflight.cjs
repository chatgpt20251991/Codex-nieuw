'use strict';

// Read-only target-environment inspection. No customer rows, migrations,
// uploads, configuration changes, messages or registration requests are made.
const EU_REGIONS = new Set(['eu-central-1', 'eu-west-1', 'eu-west-3', 'eu-north-1', 'eu-south-1', 'eu-south-2']);
const MANUAL_GATES = Object.freeze([
  'real_auth0_login_mfa_recovery_and_two_tenant_acceptance',
  'evidence_upload_clean_eicar_timeout_and_access_acceptance',
  'waf_ingress_shared_limits_and_delivered_alerts',
  'encrypted_database_and_object_restore_with_measured_rpo_rto',
  'external_penetration_test_and_closed_blocking_findings',
  'controller_processor_terms_retention_and_continuity_approval',
]);
function requireThat(value) { if (!value) throw new Error('Requirement not satisfied'); }
function https(value) {
  const url = new URL(value);
  requireThat(url.protocol === 'https:' && !url.username && !url.password && !url.hash && !url.search);
  return url;
}
function configuration(env) {
  requireThat(env.NODE_ENV === 'production' && env.AUTH_MODE === 'oidc');
  requireThat(env.BATTERY_SEMANTIC_CATALOGUE_AVAILABLE === 'false' && env.REGISTRY_BATTERY_SUBMISSION_AVAILABLE === 'false');
  requireThat(EU_REGIONS.has(env.S3_REGION) && env.S3_BUCKET?.trim());
  // This initial acceptance profile is AWS S3 with KMS/Object Lock. A different
  // provider needs a reviewed equivalent profile, not a silently skipped check.
  requireThat(!env.S3_ENDPOINT && env.S3_FORCE_PATH_STYLE !== 'true');
  const db = new URL(env.DATABASE_URL);
  requireThat(['postgres:', 'postgresql:'].includes(db.protocol));
  requireThat(db.username && db.password && db.pathname.length > 1);
  requireThat(db.searchParams.get('sslmode') === 'require' && db.searchParams.get('sslaccept') === 'strict');
  requireThat(env.MALWARE_SCANNER === 'clamav' && env.CLAMAV_HOST?.trim());
  requireThat(env.OIDC_ALLOWED_ALGORITHMS === 'RS256' && env.OIDC_AUDIENCE?.trim());
  const issuer = https(env.OIDC_ISSUER);
  requireThat(issuer.href === env.OIDC_ISSUER && issuer.pathname === '/');
  requireThat(https(env.OIDC_JWKS_URL).origin === issuer.origin);
  requireThat(env.OIDC_ORGANISATION_CLAIM === 'https://eubatterypassport.nl/organisation_id');
  requireThat(env.OIDC_ROLE_CLAIM === 'https://eubatterypassport.nl/role');
  const origins = (env.WEB_ORIGIN || '').split(',');
  requireThat(origins.length > 0 && origins.every(value => https(value).origin === value));
  for (const name of ['RESOLVER_BASE_URL', 'SUPPLIER_PORTAL_BASE_URL', 'RESTRICTED_ACCESS_BASE_URL']) https(env[name]);
  return true;
}
function oidcContract(discovery, jwks, env) {
  requireThat(discovery.issuer === env.OIDC_ISSUER && discovery.jwks_uri === env.OIDC_JWKS_URL);
  const origin = https(env.OIDC_ISSUER).origin;
  for (const name of ['authorization_endpoint', 'token_endpoint', 'end_session_endpoint']) {
    requireThat(https(discovery[name]).origin === origin);
  }
  requireThat(discovery.response_types_supported?.includes('code'));
  requireThat(discovery.id_token_signing_alg_values_supported?.includes('RS256'));
  requireThat(Array.isArray(jwks.keys) && jwks.keys.length > 0 && jwks.keys.length <= 100);
  const kids = new Set();
  for (const key of jwks.keys) {
    requireThat(typeof key.kid === 'string' && key.kid.length > 0 && !kids.has(key.kid));
    kids.add(key.kid);
    for (const secret of ['d', 'p', 'q', 'dp', 'dq', 'qi', 'oth', 'k']) requireThat(!Object.hasOwn(key, secret));
  }
  requireThat(jwks.keys.some(key => key.kty === 'RSA' && key.use === 'sig' && (!key.alg || key.alg === 'RS256') && key.n && key.e));
}
function storageContract(data, env) {
  const region = data.location.LocationConstraint === 'EU' ? 'eu-west-1' : data.location.LocationConstraint;
  requireThat(region === env.S3_REGION && EU_REGIONS.has(region));
  requireThat(data.versioning.Status === 'Enabled');
  const block = data.publicAccess.PublicAccessBlockConfiguration;
  requireThat(block && ['BlockPublicAcls', 'IgnorePublicAcls', 'BlockPublicPolicy', 'RestrictPublicBuckets'].every(k => block[k] === true));
  requireThat(data.policy.PolicyStatus?.IsPublic === false);
  const rules = data.encryption.ServerSideEncryptionConfiguration?.Rules;
  requireThat(Array.isArray(rules) && rules.length === 1);
  const encryption = rules[0].ApplyServerSideEncryptionByDefault;
  requireThat(encryption?.SSEAlgorithm === 'aws:kms');
  requireThat(new RegExp('^arn:aws:kms:' + env.S3_REGION + ':\\d{12}:key/[a-f0-9-]{36}$').test(encryption.KMSMasterKeyID || ''));
  const lock = data.lock.ObjectLockConfiguration;
  const retention = lock?.Rule?.DefaultRetention;
  requireThat(lock?.ObjectLockEnabled === 'Enabled' && ['GOVERNANCE', 'COMPLIANCE'].includes(retention?.Mode));
  const periods = [retention.Days, retention.Years].filter(v => v !== undefined);
  requireThat(periods.length === 1 && Number.isSafeInteger(periods[0]) && periods[0] > 0);
  // A positive retention setting is inspected, not approved as legally sufficient.
  const cors = data.cors.CORSRules;
  requireThat(Array.isArray(cors));
  const origins = env.WEB_ORIGIN.split(',');
  requireThat(cors.every(rule => rule.AllowedOrigins?.every(origin => origins.includes(origin))));
  for (const origin of origins) {
    requireThat(cors.some(rule => rule.AllowedOrigins.includes(origin) && rule.AllowedMethods?.includes('PUT')
      && ['content-type', 'x-amz-checksum-sha256', 'x-amz-meta-sha256'].every(header =>
        rule.AllowedHeaders?.some(allowed => allowed.toLowerCase() === header || allowed === '*' || allowed.toLowerCase() === 'x-amz-*' && header.startsWith('x-amz-')))));
  }
}
function scannerContract(version, pong, now = Date.now()) {
  requireThat(pong === 'PONG');
  const match = /^ClamAV \d+\.\d+\.\d+\/\d+\/([A-Za-z]{3} [A-Za-z]{3} +\d{1,2} \d{2}:\d{2}:\d{2} \d{4})$/.exec(version);
  requireThat(match);
  // The deployed scanner must run with TZ=UTC; VERSION has no timezone marker.
  const age = now - Date.parse(match[1] + ' GMT');
  requireThat(Number.isFinite(age) && age >= -300_000 && age <= 48 * 3600_000);
}
async function jsonDocument(url, fetcher = fetch) {
  const response = await fetcher(url, { redirect: 'error', signal: AbortSignal.timeout(10_000), headers: { accept: 'application/json' } });
  requireThat(response.ok && response.body);
  const reader = response.body.getReader(); let size = 0; const chunks = [];
  try {
    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength; requireThat(size <= 128 * 1024); chunks.push(Buffer.from(value));
    }
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
function probes(env) {
  return {
    async database() {
      const { PrismaClient } = require('@prisma/client');
      const { assertRuntimeDatabaseSecurity } = require('../../apps/api/dist/prisma/runtime-database-security');
      const url = new URL(env.DATABASE_URL);
      url.searchParams.set('connection_limit', '1'); url.searchParams.set('connect_timeout', '5'); url.searchParams.set('pool_timeout', '5');
      const db = new PrismaClient({ datasources: { db: { url: url.href } } });
      try {
        await db.$connect();
        await db.$transaction(async tx => {
          await tx.$executeRaw`SET TRANSACTION READ ONLY`;
          await tx.$executeRaw`SET LOCAL statement_timeout = '5s'`;
          await assertRuntimeDatabaseSecurity(tx);
        }, { timeout: 8000 });
      } finally { await db.$disconnect(); }
    },
    async oidc() {
      const discovery = await jsonDocument(new URL('.well-known/openid-configuration', env.OIDC_ISSUER));
      // Use only the administrator-configured JWKS destination, never an unchecked redirect in discovery.
      const keys = await jsonDocument(env.OIDC_JWKS_URL);
      oidcContract(discovery, keys, env);
    },
    async storage() {
      const aws = require('@aws-sdk/client-s3');
      const haveAuditKey = Boolean(env.PROBE_S3_ACCESS_KEY || env.PROBE_S3_SECRET_KEY);
      requireThat(!haveAuditKey || Boolean(env.PROBE_S3_ACCESS_KEY && env.PROBE_S3_SECRET_KEY));
      const s3 = new aws.S3Client({ region: env.S3_REGION, maxAttempts: 1,
        ...(haveAuditKey ? { credentials: { accessKeyId: env.PROBE_S3_ACCESS_KEY, secretAccessKey: env.PROBE_S3_SECRET_KEY,
          ...(env.PROBE_S3_SESSION_TOKEN ? { sessionToken: env.PROBE_S3_SESSION_TOKEN } : {}) } } : {}) });
      const commands = { location: 'GetBucketLocationCommand', versioning: 'GetBucketVersioningCommand',
        publicAccess: 'GetPublicAccessBlockCommand', policy: 'GetBucketPolicyStatusCommand',
        encryption: 'GetBucketEncryptionCommand', lock: 'GetObjectLockConfigurationCommand', cors: 'GetBucketCorsCommand' };
      try {
        const data = {};
        for (const [key, command] of Object.entries(commands)) {
          data[key] = await s3.send(new aws[command]({ Bucket: env.S3_BUCKET }), { abortSignal: AbortSignal.timeout(10_000) });
        }
        storageContract(data, env);
      } finally { s3.destroy(); }
    },
    async scanner() {
      const { clamdRequest } = require('../../apps/api/dist/common/storage/malware-scanner.service');
      const port = Number(env.CLAMAV_PORT || 3310); requireThat(Number.isInteger(port) && port > 0 && port <= 65535);
      const version = await clamdRequest(env.CLAMAV_HOST, port, 5000, 'VERSION');
      scannerContract(version, await clamdRequest(env.CLAMAV_HOST, port, 5000, 'PING'));
    },
  };
}
async function run(env, checks = probes(env)) {
  const results = [];
  try { configuration(env); results.push({ check: 'configuration', status: 'passed' }); }
  catch { results.push({ check: 'configuration', status: 'failed' }); }
  if (results[0].status === 'passed') {
    for (const name of ['database', 'oidc', 'storage', 'scanner']) {
      try { await checks[name](); results.push({ check: name, status: 'passed' }); }
      catch { results.push({ check: name, status: 'failed' }); }
    }
  }
  return { schema: 'eubp.production-preflight.v1', inspectedAt: new Date().toISOString(),
    technicalChecksPassed: results.length === 5 && results.every(r => r.status === 'passed'),
    customerLaunchApproved: false, registryRegistrationVerified: false, results, requiredExternalEvidence: MANUAL_GATES };
}
module.exports = { configuration, oidcContract, storageContract, scannerContract, jsonDocument, run };
if (require.main === module) {
  run(process.env).then(report => { console.log(JSON.stringify(report, null, 2)); process.exitCode = report.technicalChecksPassed ? 0 : 1; })
    .catch(() => { console.error('Production preflight could not complete.'); process.exitCode = 1; });
}
