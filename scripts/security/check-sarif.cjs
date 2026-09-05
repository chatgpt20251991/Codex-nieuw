'use strict';

const assert = require('node:assert/strict');
const { readdirSync, readFileSync } = require('node:fs');
const { join } = require('node:path');

function inspectSarif(document) {
  assert.equal(document?.version, '2.1.0', 'Expected a SARIF 2.1.0 report');
  assert(Array.isArray(document.runs) && document.runs.length > 0, 'The report contains no analysis runs');
  const findings = [];
  for (const run of document.runs) {
    assert.equal(run.tool?.driver?.name, 'CodeQL', 'Expected CodeQL analysis evidence');
    assert(Array.isArray(run.results), 'An analysis run has no results array');
    for (const invocation of run.invocations ?? []) {
      assert.notEqual(invocation.executionSuccessful, false, 'The analysis invocation failed');
      assert(!(invocation.toolExecutionNotifications ?? []).some(n => n.level === 'error'), 'The analysis reported an execution error');
    }
    for (const result of run.results) {
      const location = result.locations?.[0]?.physicalLocation;
      findings.push({
        rule: result.ruleId ?? run.tool.driver.rules?.[result.ruleIndex]?.id ?? 'unknown-rule',
        level: result.level ?? 'warning',
        file: location?.artifactLocation?.uri ?? 'unknown-location',
        line: location?.region?.startLine ?? null,
      });
    }
  }
  return findings;
}

function checkDirectory(directory) {
  const files = readdirSync(directory, { recursive: true })
    .filter(file => file.endsWith('.sarif'));
  assert(files.length > 0, 'No SARIF reports were generated');
  let count = 0;
  for (const file of files) {
    const findings = inspectSarif(JSON.parse(readFileSync(join(directory, file), 'utf8')));
    console.log(`${file}: ${findings.length} CodeQL findings`);
    // Print locations only; SARIF may contain source snippets or credentials.
    for (const finding of findings) console.log(JSON.stringify(finding));
    count += findings.length;
  }
  assert.equal(count, 0, `${count} CodeQL findings require a fix or an explicitly reviewed, narrow false-positive correction`);
  console.log('CodeQL gate passed: every report is valid and contains zero findings.');
}

if (require.main === module) checkDirectory(process.argv[2] ?? 'security-results/codeql');

module.exports = { inspectSarif, checkDirectory };
