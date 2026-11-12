'use client';
import { FormEvent, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import AppShell from '../../components/AppShell';
import { useWorkspace, useWorkspaceApi } from '../../components/WorkspaceProvider';
import { downloadEvidence } from '../../lib/evidence-review';
import { evidenceFile, evidenceUpload, parseEvidenceInventory, type EvidenceMetadata } from '../../lib/evidence-workspace';

const time = (value: string | null) => value ? new Date(value).toLocaleString() : 'Not recorded';
function failure(cause: unknown, mutation = false) {
  const code = cause instanceof Error ? cause.message : '';
  if (code === 'EVIDENCE_FILE_INVALID') return 'Choose a non-empty source file no larger than 100 MiB, with a filename of at most 240 characters.';
  if (/ROLE_FORBIDDEN|role is not permitted|HTTP 403|NO_WRITTEN_AUTHORISATION|DELEGATION_NOT_ALLOWED/i.test(code)) return 'Your account does not have permission for this document action. Contact your organisation administrator.';
  if (/HTTP 401|Unauthorized|session/i.test(code)) return 'Your session is unavailable. Sign in again, then refresh the document list.';
  if (/EVIDENCE_MALWARE_DETECTED/i.test(code)) return 'The document was rejected by the security scan. It cannot be reviewed or used as verified evidence.';
  if (/EVIDENCE_REVIEW_|EVIDENCE_OUTSIDE_VALIDITY|EVIDENCE_NOT_READY|EVIDENCE_CHANGED_RETRY/i.test(code)) return 'This document is not currently available for review. Refresh and check its status; integrity, security and validity checks must pass.';
  if (code === 'EVIDENCE_UPLOAD_INVALID') return 'The private upload destination could not be verified. No file was sent to that destination. Contact your administrator.';
  if (code === 'EVIDENCE_RESPONSE_INVALID') return 'The document list could not be safely read. Refresh before continuing.';
  return mutation ? 'The operation could not be confirmed. Refresh and inspect the document status before trying again.'
    : 'The document request could not be completed. Refresh the list before continuing.';
}

export default function Evidence() {
  const apiFetch = useWorkspaceApi();
  const { view, customer } = useWorkspace();
  const permitted = (action: 'evidenceWrite' | 'evidenceReview') => view.actingId === null || Boolean(customer?.availableActions.includes(action));
  const [rows, setRows] = useState<EvidenceMetadata[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [file, setFile] = useState<File>();
  const [fileInputKey, setFileInputKey] = useState(0);
  const [downloadedFor, setDownloadedFor] = useState('');
  const [reviewed, setReviewed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const pending = useRef(false), epoch = useRef(0), controller = useRef<AbortController | undefined>(undefined);
  const selected = rows.find(row => row.id === selectedId);

  function resetReview() { setDownloadedFor(''); setReviewed(false); }
  function clearData() {
    setRows([]); setSelectedId(''); setFile(undefined); setFileInputKey(value => value + 1); setReady(false); resetReview();
  }
  function invalidate() { epoch.current++; controller.current?.abort(); controller.current = undefined; }
  function start() {
    invalidate(); const current = epoch.current, abort = new AbortController(); controller.current = abort;
    const signal = AbortSignal.any([abort.signal, apiFetch.signal]);
    return { signal, current: () => current === epoch.current && !signal.aborted && apiFetch.isCurrent() };
  }
  async function refresh(keepId = '', successNotice = '') {
    const request = start(); pending.current = true; setBusy(true); clearData(); setError(''); setNotice('');
    try {
      const result = await apiFetch<unknown>('/evidence?limit=100', { signal: request.signal });
      if (!request.current()) return;
      const inventory = parseEvidenceInventory(result);
      setRows(inventory); setReady(true); setSelectedId(inventory.some(row => row.id === keepId) ? keepId : ''); setNotice(successNotice);
    } catch (cause) { if (request.current()) { clearData(); setError(failure(cause)); } }
    finally { if (request.current()) { pending.current = false; setBusy(false); } }
  }
  useEffect(() => {
    refresh();
    const expired = () => {
      invalidate(); pending.current = false; clearData(); setBusy(false); setNotice('');
      setError('Your session or workspace changed. Refresh the document list before continuing.');
    };
    const storage = (event: StorageEvent) => {
      if (process.env.NODE_ENV === 'development' && (!event.key || ['eubp_token', 'eubp_acting_org'].includes(event.key))) expired();
    };
    window.addEventListener('eubp-session-expired', expired); window.addEventListener('storage', storage);
    return () => { invalidate(); window.removeEventListener('eubp-session-expired', expired); window.removeEventListener('storage', storage); };
  }, []);

  async function upload(event: FormEvent) {
    event.preventDefault(); if (!permitted('evidenceWrite') || pending.current || !ready || !file) return;
    const source = file, request = start(); pending.current = true; setBusy(true); setError(''); resetReview();
    setSelectedId(''); setFile(undefined); setFileInputKey(value => value + 1); setNotice('Checking the file and calculating its integrity hash…');
    try {
      const metadata = evidenceFile(source);
      const content = await source.arrayBuffer();
      if (!request.current()) return;
      const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', content));
      if (!request.current()) return;
      const sha256 = [...digest].map(byte => byte.toString(16).padStart(2, '0')).join('');
      const checksum = btoa(String.fromCharCode(...digest));
      setNotice('Uploading the source document to private storage…');
      const session = await apiFetch<unknown>('/evidence/upload-sessions', { method: 'POST', signal: request.signal,
        body: JSON.stringify({ ...metadata, sha256, evidenceType: 'source_document' }) });
      if (!request.current()) return;
      // Capabilities and storage keys stay in this operation's local variables.
      // Check the exact origin, method and checksum headers before sending bytes.
      const destination = evidenceUpload(session, { mimeType: metadata.mimeType, sha256, checksum }, process.env.NEXT_PUBLIC_EVIDENCE_UPLOAD_ORIGIN || '');
      const response = await fetch(destination.url, { method: 'PUT', headers: destination.headers, body: source,
        signal: request.signal, credentials: 'omit', referrerPolicy: 'no-referrer', redirect: 'error', mode: 'cors', cache: 'no-store' });
      if (!request.current()) return;
      if (!response.ok) throw new Error('EVIDENCE_UPLOAD_FAILED');
      setNotice('Checking the stored bytes and document security…');
      await apiFetch(`/evidence/${destination.evidenceId}/finalize`, { method: 'POST', signal: request.signal });
      if (!request.current()) return;
      await refresh(destination.evidenceId, 'Source uploaded and integrity-checked. Human review and verification are separate steps.');
    } catch (cause) { if (request.current()) { clearData(); setNotice(''); setError(failure(cause, true)); } }
    finally { if (request.current()) { pending.current = false; setBusy(false); } }
  }
  function select(id: string) {
    if (pending.current) return;
    invalidate(); resetReview(); setError(''); setNotice(''); setSelectedId(rows.some(row => row.id === id) ? id : '');
  }
  async function reviewDownload() {
    if (!permitted('evidenceReview') || pending.current || !selected || !ready) return;
    const id = selected.id, request = start(); pending.current = true; setBusy(true); resetReview(); setError(''); setNotice('');
    try {
      await downloadEvidence(id, { request: apiFetch, signal: request.signal, isCurrent: request.current });
      if (!request.current()) return;
      setDownloadedFor(id); setNotice('Source download initiated. Read the document before recording verification. Issuing the download does not prove it was received or reviewed.');
    } catch (cause) { if (request.current()) { clearData(); setError(failure(cause)); } }
    finally { if (request.current()) { pending.current = false; setBusy(false); } }
  }
  async function verify() {
    if (!permitted('evidenceReview') || pending.current || !selected || !ready || !reviewed || downloadedFor !== selected.id) return;
    const id = selected.id, request = start(); pending.current = true; setBusy(true); resetReview(); setError(''); setNotice('');
    try {
      await apiFetch(`/evidence/${id}/verify`, { method: 'POST', signal: request.signal });
      if (!request.current()) return;
      await refresh(id, 'Evidence verification recorded. This does not validate passport values, publish a passport or establish EU registration.');
    } catch (cause) { if (request.current()) { clearData(); setError(failure(cause, true)); } }
    finally { if (request.current()) { pending.current = false; setBusy(false); } }
  }

  const current = selected && ['uploaded', 'unverified', 'verified'].includes(selected.verificationStatus)
    && (!selected.issuedAt || Date.parse(selected.issuedAt) <= Date.now())
    && (!selected.expiresAt || Date.parse(selected.expiresAt) > Date.now());
  return <AppShell>
    <section className="pageHead"><div><div className="kicker">EVIDENCE AND REVIEW</div><h1>Source documents you can trace and review.</h1>
      <p>Upload the source, check the stored document and record a separate human review. An upload, a security scan and an evidence verification are distinct steps.</p></div>
      <button type="button" className="button secondary" disabled={busy} onClick={() => refresh()}>Refresh documents</button></section>
    {error && <div className="alert" role="alert">{error}</div>}
    {notice && <div className="notice" role="status">{notice}</div>}
    {busy && !notice && <div className="notice" role="status">Checking source documents…</div>}
    <div className="twoCol">
      <section className="panel"><h2>Upload a source document</h2><form onSubmit={upload}>
        <label>Source file<input key={fileInputKey} type="file" disabled={busy || !ready || !permitted('evidenceWrite')} onChange={event => {
          resetReview(); setError(''); setNotice(''); setFile(event.target.files?.[0]);
        }} /></label>
        <p>Files up to 100 MiB. Documents are stored privately and checked before they become available for review.</p>
        <button type="submit" className="button" disabled={busy || !ready || !file || !permitted('evidenceWrite')}>Upload source document</button>
        {!permitted('evidenceWrite') && <p>Uploading is not included in this authorisation.</p>}
      </form></section>
      <section className="panel"><h2>Review policy</h2><div className="proofList">
        <div><b>1</b><span>Check that the source covers the correct organisation, model or agreement.</span></div>
        <div><b>2</b><span>Read the actual document. A download or machine extraction is not a recorded human review.</span></div>
        <div><b>3</b><span>Verify only after checking relevance, authenticity, dates and supporting details.</span></div>
        <div><b>4</b><span>Passport values still need their own review and validation before publication.</span></div>
      </div></section>
    </div>
    <section className="panel"><h2>Source documents</h2><p>This list shows the latest 100 records for the active organisation. Older documents are not included in this view.</p>
      <label>Document to review<select aria-label="Document to review" value={selectedId} disabled={busy || !ready} onChange={event => select(event.target.value)}>
        <option value="">Select a source document</option>{rows.map(row => <option key={row.id} value={row.id}>{row.originalFilename} · {row.verificationStatus} · {row.id}</option>)}</select></label>
      {ready && !rows.length && <p>No source documents found. Upload a document to start the review process.</p>}
      {!ready && !busy && <p>Sign in and refresh to load the document list.</p>}
      {selected && <div className="evidenceReview" aria-label="Selected source document">
        <div className="panelHead"><div><h3>{selected.originalFilename}</h3><div className="tiny hashText">Evidence ID: {selected.id}</div></div><span className="badge neutral">{selected.verificationStatus}</span></div>
        <dl className="passportMetadata"><dt>Content type</dt><dd>{selected.mimeType || 'Not recorded'}</dd><dt>File size</dt><dd>{selected.sizeBytes === null ? 'Not recorded' : `${Number(selected.sizeBytes).toLocaleString()} bytes`}</dd>
          <dt>Uploaded</dt><dd>{time(selected.uploadedAt)}</dd><dt>Issued</dt><dd>{time(selected.issuedAt)}</dd><dt>Expires</dt><dd>{time(selected.expiresAt)}</dd></dl>
        <div className="workflowActions"><button type="button" className="button secondary" disabled={busy || !current || !permitted('evidenceReview')} onClick={reviewDownload}>Download source for review</button></div>
        <p>The download is limited to the exact stored version accepted by the security checks. Reviewer permissions and current document validity are checked by the server.</p>
        <label className="checkLabel"><input type="checkbox" checked={reviewed} disabled={busy || !current || downloadedFor !== selected.id || !permitted('evidenceReview')} onChange={event => setReviewed(event.target.checked)} /><span>I have read this source document and reviewed its relevance, authenticity and validity.</span></label>
        <button type="button" className="button" disabled={busy || !current || !reviewed || downloadedFor !== selected.id || !permitted('evidenceReview')} onClick={verify}>Record evidence verification</button>
        {!permitted('evidenceReview') && <p>Private source review and verification are not included in this authorisation.</p>}
        {selected.eligibleForAuthorisation && <div className="notice single"><strong>Eligible authorisation evidence</strong><p>The current document checks permit it to support an authorisation. Confirm that the written agreement covers the intended provider and actions.</p><Link className="button secondary" href="/authorisations">Manage written authorisations</Link></div>}
      </div>}
    </section>
  </AppShell>;
}
