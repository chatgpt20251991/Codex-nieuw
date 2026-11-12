#!/usr/bin/env node
'use strict';
// Dependency-free offline verifier. Never makes network requests or loads a database.
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { pipeline } = require('node:stream/promises');
const { Transform } = require('node:stream');
const MAX_MANIFEST_BYTES = 8 * 1024 * 1024;
const MAX_SOURCE_BYTES = 100 * 1024 * 1024;
const MAX_ARCHIVE_SOURCE_BYTES = 2 * 1024 * 1024 * 1024;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HEX = /^[a-f0-9]{64}$/;
class ExportVerificationError extends Error { constructor(code) { super(code); this.code = code; } }
function demand(condition, code) { if (!condition) throw new ExportVerificationError(code); }
function canonicalize(value) {
  const json = JSON.stringify(value);
  demand(json !== undefined, 'JSON_VALUE_REQUIRED');
  const sort = input => input === null || typeof input !== 'object' ? JSON.stringify(input)
    : Array.isArray(input) ? '[' + input.map(sort).join(',') + ']'
      : '{' + Object.keys(input).sort().map(key => JSON.stringify(key) + ':' + sort(input[key])).join(',') + '}';
  return sort(JSON.parse(json));
}
const hashJson = value => createHash('sha256').update(canonicalize(value)).digest('hex');

function verifyManifest(envelope, expectedPayloadSha256) {
  demand(Buffer.byteLength(JSON.stringify(envelope), 'utf8') <= MAX_MANIFEST_BYTES, 'MANIFEST_SIZE_EXCEEDED');
  demand(envelope?.schema === 'eubp.operator-export.v1', 'UNSUPPORTED_EXPORT_SCHEMA');
  demand(envelope.integrity?.algorithm === 'sha256' && envelope.integrity?.canonicalization === 'eubp.sorted-json.v1', 'UNSUPPORTED_INTEGRITY_PROFILE');
  const p = envelope.payload, digest = hashJson(p);
  demand(HEX.test(envelope.integrity.payloadSha256) && digest === envelope.integrity.payloadSha256, 'EXPORT_PAYLOAD_HASH_MISMATCH');
  if (expectedPayloadSha256 !== undefined) {
    demand(HEX.test(expectedPayloadSha256) && digest === expectedPayloadSha256, 'TRUSTED_PAYLOAD_HASH_MISMATCH');
  }
  demand(p?.classification === 'private_operator_all_access_tiers' && UUID.test(p?.exportId) &&
    Number.isFinite(Date.parse(p?.exportedAt)) && UUID.test(p?.organisation?.id) && UUID.test(p?.model?.id) &&
    UUID.test(p?.item?.id) && UUID.test(p?.item?.publicId) && p.item.modelId === p.model.id, 'EXPORT_IDENTITY_INVALID');
  demand(p.coverage?.batteryItemId === p.item.id && p.coverage?.sourceDocumentBytesIncluded === false &&
    p.coverage?.completeCustomerExitArchive === false && p.coverage?.publicationTimeEvidenceMetadataAvailable === false,
  'EXPORT_COVERAGE_INVALID');
  demand(Array.isArray(p.versions) && p.versions.length > 0 && p.versions.length <= 256 &&
    p.coverage.versionCount === p.versions.length && p.coverage.firstVersionNo === 1 &&
    p.coverage.lastVersionNo === p.versions.length, 'VERSION_COVERAGE_INVALID');
  const referencedEvidenceIds = new Set(), versionIds = new Set();
  let previous = null;
  for (const [index, v] of p.versions.entries()) {
    demand(UUID.test(v.id) && !versionIds.has(v.id), 'VERSION_ID_INVALID'); versionIds.add(v.id);
    demand(v.versionNo === index + 1 && v.previousVersionHash === previous && HEX.test(v.sha256), 'VERSION_CHAIN_BROKEN');
    demand(v.publicationState === 'published' && Number.isFinite(Date.parse(v.publishedAt)) &&
      v.canonicalJson?.schema === v.schemaVersion && v.canonicalJson?.ruleSetVersion === v.ruleSetVersion,
    'VERSION_METADATA_INVALID');
    demand(hashJson(v.canonicalJson) === v.sha256, 'VERSION_HASH_MISMATCH');
    const canonical = v.canonicalJson;
    demand(canonical.battery?.id === p.item.id && canonical.battery?.modelId === p.model.id &&
      canonical.battery?.publicId === p.item.publicId && Array.isArray(canonical.values), 'VERSION_IDENTITY_INVALID');
    const fields = new Set();
    for (const value of canonical.values) {
      demand(Number.isInteger(value?.fieldId) && value.fieldId >= 1 && value.fieldId <= 71 && !fields.has(value.fieldId), 'VERSION_FIELDS_INVALID');
      fields.add(value.fieldId);
      demand(Array.isArray(value.evidenceIds), 'VERSION_EVIDENCE_INVALID');
      for (const id of value.evidenceIds) { demand(typeof id === 'string' && UUID.test(id), 'VERSION_EVIDENCE_INVALID'); referencedEvidenceIds.add(id); }
    }
    previous = v.sha256;
  }
  demand(referencedEvidenceIds.size <= 5000 && Array.isArray(p.evidence) && p.evidence.length <= 5000, 'EVIDENCE_LIMIT_EXCEEDED');
  const exported = new Set(), unavailable = [];
  for (const evidence of p.evidence) {
    demand(UUID.test(evidence?.id) && referencedEvidenceIds.has(evidence.id) && !exported.has(evidence.id), 'EVIDENCE_SCOPE_INVALID');
    exported.add(evidence.id);
    if (!(HEX.test(evidence.sha256) && typeof evidence.sizeBytes === 'string' && /^[1-9][0-9]*$/.test(evidence.sizeBytes) &&
        BigInt(evidence.sizeBytes) <= BigInt(MAX_SOURCE_BYTES) && typeof evidence.storageVersionId === 'string' &&
        evidence.storageVersionId.trim().length > 0 && evidence.storageVersionId.trim() !== 'null')) unavailable.push(evidence.id);
  }
  const missing = [...referencedEvidenceIds].filter(id => !exported.has(id)).sort();
  demand(Array.isArray(p.coverage.missingEvidenceIds) && JSON.stringify(missing) === JSON.stringify(p.coverage.missingEvidenceIds), 'EVIDENCE_COVERAGE_INVALID');
  return { schema: 'eubp.operator-export-verification.v1', internallyConsistent: true,
    anchoredToExpectedPayloadHash: expectedPayloadSha256 !== undefined, payloadSha256: digest,
    versionCount: p.versions.length, referencedEvidenceCount: referencedEvidenceIds.size,
    missingEvidenceMetadata: [...missing, ...unavailable].sort(), sourceBytesVerified: false,
    completeCustomerExitArchive: false,
    notice: 'Hash consistency does not prove authenticity, original publication-time evidence, regulatory compliance, EU registration or service continuity.' };
}

async function regularFile(filename, maxBytes) {
  // Open once, then inspect the descriptor that all reads will actually use.
  // Nonblocking open prevents a substituted POSIX FIFO from hanging before it
  // can be rejected; platforms without these flags still check the leaf below.
  const handle = await fsp.open(filename, fs.constants.O_RDONLY |
    (fs.constants.O_NOFOLLOW || 0) | (fs.constants.O_NONBLOCK || 0));
  try {
    const stat = await handle.stat();
    demand(stat.isFile() && stat.size <= maxBytes, 'UNSAFE_OR_OVERSIZED_FILE');
    const entry = await fsp.lstat(filename);
    demand(entry.isFile() && !entry.isSymbolicLink(), 'UNSAFE_OR_OVERSIZED_FILE');
    demand(entry.dev === stat.dev && entry.ino === stat.ino && entry.size === stat.size, 'SOURCE_CHANGED_DURING_READ');
    return handle;
  } catch (error) { await handle.close(); throw error; }
}
async function loadManifest(filename) {
  const handle = await regularFile(filename, MAX_MANIFEST_BYTES);
  try {
    const chunks = []; let size = 0;
    for await (const chunk of handle.createReadStream({ autoClose: false })) {
      size += chunk.length; demand(size <= MAX_MANIFEST_BYTES, 'MANIFEST_SIZE_EXCEEDED'); chunks.push(chunk);
    }
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks, size)));
  }
  finally { await handle.close(); }
}
async function sourceDigest(filename, expectedSize) {
  const handle = await regularFile(filename, MAX_SOURCE_BYTES);
  const hash = createHash('sha256'); let bytes = 0;
  try {
    for await (const chunk of handle.createReadStream({ autoClose: false })) {
      bytes += chunk.length; demand(bytes <= expectedSize && bytes <= MAX_SOURCE_BYTES, 'SOURCE_SIZE_MISMATCH'); hash.update(chunk);
    }
    demand(bytes === expectedSize, 'SOURCE_SIZE_MISMATCH'); return hash.digest('hex');
  } finally { await handle.close(); }
}
async function sourceRoot(directory) {
  const stat = await fsp.lstat(directory);
  demand(stat.isDirectory() && !stat.isSymbolicLink(), 'UNSAFE_SOURCE_DIRECTORY');
  return fsp.realpath(directory);
}
async function verifySources(envelope, directory, expectedPayloadSha256) {
  const result = verifyManifest(envelope, expectedPayloadSha256);
  demand(result.missingEvidenceMetadata.length === 0, 'REFERENCED_EVIDENCE_METADATA_UNAVAILABLE');
  const root = await sourceRoot(directory); let bytes = 0;
  for (const evidence of envelope.payload.evidence) {
    bytes += Number(evidence.sizeBytes); demand(bytes <= MAX_ARCHIVE_SOURCE_BYTES, 'ARCHIVE_SOURCE_LIMIT_EXCEEDED');
    const actual = await sourceDigest(path.join(root, evidence.id + '.bin'), Number(evidence.sizeBytes));
    demand(actual === evidence.sha256, 'SOURCE_HASH_MISMATCH');
  }
  return { ...result, sourceBytesVerified: true, sourceBytes: bytes };
}
async function assemble(envelope, sourceDirectory, outputDirectory, expectedPayloadSha256) {
  // Verify before creating output. Never overwrite an existing directory or file.
  await verifySources(envelope, sourceDirectory, expectedPayloadSha256);
  const input = await sourceRoot(sourceDirectory);
  const requested = path.resolve(outputDirectory), parent = await fsp.realpath(path.dirname(requested));
  const destination = path.join(parent, path.basename(requested));
  await fsp.mkdir(destination, { mode: 0o700 }); await fsp.mkdir(path.join(destination, 'sources'), { mode: 0o700 });
  // Preserve the server's compact byte bound; pretty-printing can double a valid
  // near-limit manifest and make the copied independent verifier reject it.
  await fsp.writeFile(path.join(destination, 'passport-export.json'), JSON.stringify(envelope), { flag: 'wx', mode: 0o600 });
  await fsp.copyFile(__filename, path.join(destination, 'verify-passport-export.cjs'), fs.constants.COPYFILE_EXCL);
  await fsp.chmod(path.join(destination, 'verify-passport-export.cjs'), 0o600);
  for (const evidence of envelope.payload.evidence) {
    const source = await regularFile(path.join(input, evidence.id + '.bin'), MAX_SOURCE_BYTES);
    let size = 0;
    const limit = new Transform({ transform(chunk, encoding, callback) {
      size += chunk.length;
      callback(size > Number(evidence.sizeBytes) ? new ExportVerificationError('SOURCE_SIZE_MISMATCH') : null, chunk);
    } });
    try { await pipeline(source.createReadStream({ autoClose: false }), limit,
      fs.createWriteStream(path.join(destination, 'sources', evidence.id + '.bin'), { flags: 'wx', mode: 0o600 })); }
    finally { await source.close(); }
  }
  // A changed input between verification and copying cannot produce a successful archive.
  const result = await verifySources(envelope, path.join(destination, 'sources'), expectedPayloadSha256);
  await fsp.writeFile(path.join(destination, 'integrity-report.json'), JSON.stringify(result, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  return result;
}
async function main(args) {
  const [command, manifest, sourceDirectory, outputDirectory] = args;
  const expectedIndex = args.indexOf('--expected-sha256');
  const expected = expectedIndex < 0 ? undefined : args[expectedIndex + 1];
  demand(expectedIndex < 0 || (expected && HEX.test(expected) && expectedIndex === args.length - 2), 'EXPECTED_SHA256_INVALID');
  const positions = expectedIndex < 0 ? args : args.slice(0, expectedIndex);
  demand((command === 'verify' && [2, 3].includes(positions.length)) || (command === 'assemble' && positions.length === 4),
    'USAGE');
  const envelope = await loadManifest(manifest);
  const result = command === 'assemble' ? await assemble(envelope, sourceDirectory, outputDirectory, expected)
    : positions.length === 3 ? await verifySources(envelope, sourceDirectory, expected) : verifyManifest(envelope, expected);
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
}
module.exports = { canonicalize, hashJson, verifyManifest, loadManifest, verifySources, assemble };
if (require.main === module) main(process.argv.slice(2)).catch(error => {
  const filesystemCodes = new Set(['ENOENT', 'EEXIST', 'EACCES', 'EPERM', 'ENOTDIR', 'ENOSPC', 'EISDIR', 'EMFILE', 'ENFILE', 'EINVAL', 'ELOOP']);
  const code = error instanceof ExportVerificationError ? error.code
    : error instanceof SyntaxError ? 'INVALID_JSON' : filesystemCodes.has(error?.code) ? error.code : 'VERIFICATION_FAILED';
  // JSON parse errors can quote confidential data; filesystem messages contain
  // private paths. Never print the underlying message or stack.
  process.stderr.write('Export verification failed: ' + code + '\n');
  if (code === 'USAGE') process.stderr.write('Usage: node passport-export.cjs verify manifest.json [sources-directory] [--expected-sha256 HASH]\n       node passport-export.cjs assemble manifest.json sources-directory NEW-archive-directory [--expected-sha256 HASH]\n');
  process.exitCode = 1;
});
