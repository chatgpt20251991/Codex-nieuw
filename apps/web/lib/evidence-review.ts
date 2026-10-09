import { apiFetch } from './api';

// Signed document URLs are capabilities. Use them once for an attachment;
// never put them in component state, local storage, page text or a log.
export function evidenceReviewUrl(result: any, evidenceId: string, storageOrigin: string, now = Date.now()) {
  const approved = new URL(storageOrigin);
  const url = new URL(result.downloadUrl);
  const local = process.env.NODE_ENV === 'development' && ['localhost', '127.0.0.1', '[::1]'].includes(approved.hostname);
  const expires = Date.parse(result.expiresAt);
  if (approved.username || approved.password || approved.search || approved.hash || approved.pathname !== '/'
    || (approved.protocol !== 'https:' && !(local && approved.protocol === 'http:'))
    || url.origin !== approved.origin || url.username || url.password || url.hash
    || result.evidenceId !== evidenceId || result.method !== 'GET' || result.reviewStatus !== 'not_recorded'
    || !Number.isInteger(result.expiresInSeconds) || result.expiresInSeconds < 1 || result.expiresInSeconds > 60
    || !Number.isFinite(expires) || expires <= now || expires > now + 60000) {
    throw new Error('The source document download could not be verified.');
  }
  return url.href;
}

export async function downloadEvidence(evidenceId: string) {
  const result = await apiFetch(`/evidence/${encodeURIComponent(evidenceId)}/review-download`, { method: 'POST' });
  const url = evidenceReviewUrl(result, evidenceId, process.env.NEXT_PUBLIC_EVIDENCE_UPLOAD_ORIGIN || '');
  const anchor = document.createElement('a');
  anchor.href = url; anchor.rel = 'noopener noreferrer'; anchor.referrerPolicy = 'no-referrer';
  anchor.download = 'evidence-source';
  document.body.appendChild(anchor); anchor.click(); anchor.remove();
}
