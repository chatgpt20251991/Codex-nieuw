'use strict';

// Offline generation only. This program never contacts Render or provisions resources.
const { readFileSync, writeFileSync, mkdirSync } = require('node:fs');
const { resolve, dirname } = require('node:path');
const root = resolve(__dirname, '../..');
const scannerImage = 'docker.io/clamav/clamav:stable@sha256:ebec5bc138401b36ae987caa1a3fa3c3b2a21ed3d51f0bfa5852825e663e67b0';
const servicePlans = new Set(['starter', 'standard', 'pro']);
const dbPlans = new Set(['basic-1gb', 'pro-4gb']);
const secretKeys = new Set(['DATABASE_URL', 'AUTH0_CLIENT_SECRET', 'AUTH0_SECRET', 'S3_ACCESS_KEY', 'S3_SECRET_KEY']);
function envTemplate(text) {
  const keys = new Set();
  return text.split(/\r?\n/).flatMap(line => {
    if (!line.trim() || line.trim().startsWith('#')) return [];
    const match = /^([A-Z][A-Z0-9_]*)=(.*)$/.exec(line);
    if (!match || keys.has(match[1])) throw Error('Invalid or duplicate template field');
    const [, key, value] = match;
    keys.add(key);
    if (secretKeys.has(key) && value) throw Error('Secret values cannot enter a Blueprint');
    return [{ key, ...(value ? { value } : { sync: false }) }];
  });
}
function blueprint(plans, templates) {
  // No paid plan is silently selected. The caller supplies a reviewed proposal.
  if (!plans || !servicePlans.has(plans.api) || !servicePlans.has(plans.web)
    || plans.scanner !== 'pro' || !dbPlans.has(plans.database)) throw Error('Explicit supported plans required');
  const apiVars = envTemplate(templates.api), webVars = envTemplate(templates.web);
  const scannerHost = apiVars.find(item => item.key === 'CLAMAV_HOST');
  if (!scannerHost) throw Error('Scanner configuration missing');
  delete scannerHost.sync;
  scannerHost.fromService = { type: 'pserv', name: 'eubp-acceptance-scanner', property: 'host' };
  // Both Docker builds need these PUBLIC build args. Nothing secret is a Docker ARG.
  apiVars.push({ key: 'NEXT_PUBLIC_API_URL', value: 'https://api.eubatterypassport.nl/v1' },
    { key: 'NEXT_PUBLIC_EVIDENCE_UPLOAD_ORIGIN', fromService: {
      type: 'web', name: 'eubp-acceptance-web', envVarKey: 'NEXT_PUBLIC_EVIDENCE_UPLOAD_ORIGIN' } });
  const service = (kind, envVars) => ({
    type: 'web', name: `eubp-acceptance-${kind}`, runtime: 'docker', region: 'frankfurt',
    plan: plans[kind], repo: 'https://github.com/chatgpt20251991/Codex-nieuw', branch: 'main',
    dockerfilePath: './infra/deployment/Dockerfile', dockerContext: '.',
    dockerCommand: `node scripts/ops/start-service.cjs ${kind}`,
    autoDeployTrigger: 'off', numInstances: 1,
    healthCheckPath: kind === 'api' ? '/v1/health' : '/',
    domains: [kind === 'api' ? 'api.eubatterypassport.nl' : 'app.eubatterypassport.nl'],
    envVars,
  });
  return {
    previews: { generation: 'off' },
    projects: [{ name: 'EUBatteryPassport', environments: [{ name: 'acceptance',
      services: [service('api', apiVars), service('web', webVars), {
        type: 'pserv', name: 'eubp-acceptance-scanner', runtime: 'image', region: 'frankfurt',
        plan: plans.scanner, numInstances: 1, autoDeployTrigger: 'off',
        image: { url: scannerImage },
        disk: { name: 'eubp-scanner-signatures', mountPath: '/var/lib/clamav', sizeGB: 5 },
        envVars: [{ key: 'TZ', value: 'UTC' }],
      }],
      databases: [{ name: 'eubp-acceptance-db', region: 'frankfurt', plan: plans.database,
        postgresMajorVersion: '16', databaseName: 'eubp_acceptance', user: 'eubp_admin',
        diskSizeGB: 10, ipAllowList: [] }],
    }] }],
  };
}
if (require.main === module) {
  try {
    const [, , planFile, output] = process.argv;
    if (!planFile || !output) throw Error('Usage');
    const config = JSON.parse(readFileSync(resolve(planFile), 'utf8'));
    const data = blueprint(config.plans, {
      api: readFileSync(resolve(root, 'infra/deployment/api.env.example'), 'utf8'),
      web: readFileSync(resolve(root, 'infra/deployment/web.env.example'), 'utf8'),
    });
    const destination = resolve(output);
    mkdirSync(dirname(destination), { recursive: true });
    // JSON is valid YAML; avoids unreviewed quoting or template substitutions.
    writeFileSync(destination, JSON.stringify(data, null, 2) + '\n', { flag: 'wx' });
    console.log('Acceptance Blueprint generated. No resources created; approval and real secrets are still required.');
  } catch {
    console.error('Blueprint not written: use a valid plan file and a new output path.');
    process.exitCode = 1;
  }
}
module.exports = { blueprint, envTemplate };
