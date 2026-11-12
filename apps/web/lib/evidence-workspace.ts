const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_FILE_BYTES = 100 * 1024 * 1024;
const statuses = new Set(['pending_upload', 'uploaded', 'unverified', 'verified', 'rejected', 'superseded']);
const object = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const nullableDate = (value: unknown): value is string | null => value === null || (typeof value === 'string'
  && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value)));

export type EvidenceMetadata = {
  id: string; originalFilename: string; mimeType: string | null; sizeBytes: string | null; verificationStatus: string;
  uploadedAt: string | null; issuedAt: string | null; expiresAt: string | null; eligibleForAuthorisation: boolean;
};

export function parseEvidenceInventory(value: unknown): EvidenceMetadata[] {
  if (!Array.isArray(value) || value.length > 100) throw new Error('EVIDENCE_RESPONSE_INVALID');
  const rows = value.map(row => {
    if (!object(row) || typeof row.id !== 'string' || !UUID.test(row.id)
      || (row.originalFilename !== null && (typeof row.originalFilename !== 'string' || row.originalFilename.length > 1000))
      || (row.mimeType !== null && (typeof row.mimeType !== 'string' || row.mimeType.length > 120))
      || (row.sizeBytes !== null && (typeof row.sizeBytes !== 'string' || !/^\d{1,16}$/.test(row.sizeBytes)))
      || typeof row.verificationStatus !== 'string' || !statuses.has(row.verificationStatus)
      || !nullableDate(row.uploadedAt) || !nullableDate(row.issuedAt) || !nullableDate(row.expiresAt)
      || typeof row.eligibleForAuthorisation !== 'boolean'
      || (row.eligibleForAuthorisation && row.verificationStatus !== 'verified')) throw new Error('EVIDENCE_RESPONSE_INVALID');
    return { id: row.id, originalFilename: row.originalFilename || `Document ${row.id}`, mimeType: row.mimeType,
      sizeBytes: row.sizeBytes, verificationStatus: row.verificationStatus, uploadedAt: row.uploadedAt,
      issuedAt: row.issuedAt, expiresAt: row.expiresAt, eligibleForAuthorisation: row.eligibleForAuthorisation } as EvidenceMetadata;
  });
  if (new Set(rows.map(row => row.id)).size !== rows.length) throw new Error('EVIDENCE_RESPONSE_INVALID');
  return rows;
}

export function evidenceFile(file: Pick<File, 'name' | 'size' | 'type'>) {
  if (!file.name.trim() || file.name.length > 240 || !Number.isSafeInteger(file.size) || file.size < 1 || file.size > MAX_FILE_BYTES
    || file.type.length > 120 || /[\r\n]/.test(file.type)) throw new Error('EVIDENCE_FILE_INVALID');
  return { originalFilename: file.name, mimeType: file.type || 'application/octet-stream', sizeBytes: file.size };
}

export function evidenceUpload(result: unknown, input: { mimeType: string; sha256: string; checksum: string }, storageOrigin: string) {
  if (!object(result) || typeof result.evidenceId !== 'string' || !UUID.test(result.evidenceId)
    || result.method !== 'PUT' || typeof result.uploadUrl !== 'string' || !object(result.requiredHeaders)
    || !/^[a-f0-9]{64}$/.test(input.sha256) || !/^[A-Za-z0-9+/]{43}=$/.test(input.checksum)) throw new Error('EVIDENCE_UPLOAD_INVALID');
  const approved = new URL(storageOrigin), url = new URL(result.uploadUrl);
  const local = process.env.NODE_ENV === 'development' && ['localhost', '127.0.0.1', '[::1]'].includes(approved.hostname);
  if (approved.username || approved.password || approved.search || approved.hash || approved.pathname !== '/'
    || (approved.protocol !== 'https:' && !(local && approved.protocol === 'http:'))
    || url.origin !== approved.origin || url.username || url.password || url.hash) throw new Error('EVIDENCE_UPLOAD_INVALID');
  const required = result.requiredHeaders;
  if (Object.keys(required).length !== 3 || required['content-type'] !== input.mimeType
    || required['x-amz-meta-sha256'] !== input.sha256 || required['x-amz-checksum-sha256'] !== input.checksum) throw new Error('EVIDENCE_UPLOAD_INVALID');
  return { evidenceId: result.evidenceId, url: url.href, headers: { 'content-type': input.mimeType,
    'x-amz-meta-sha256': input.sha256, 'x-amz-checksum-sha256': input.checksum } };
}
