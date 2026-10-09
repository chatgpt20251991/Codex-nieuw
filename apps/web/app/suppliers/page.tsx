'use client';
import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import AppShell from '../../components/AppShell';
import { apiFetch } from '../../lib/api';
import { downloadEvidence } from '../../lib/evidence-review';

const labels: Record<string, string> = {
  draft: 'Link created, not sent', sent: 'Legacy sent status', opened: 'Opened',
  partially_submitted: 'Partially submitted', submitted: 'Awaiting review', accepted: 'Imported, not validated',
  rejected: 'Rejected', cancelled: 'Cancelled', expired: 'Expired',
};
function displayValue(value: unknown) {
  return typeof value === 'string' ? value : JSON.stringify(value, null, 2);
}

export default function Suppliers() {
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [models, setModels] = useState<any[]>([]);
  const [requests, setRequests] = useState<any[]>([]);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [country, setCountry] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [modelId, setModelId] = useState('');
  const [fieldIds, setFieldIds] = useState('');
  const [message, setMessage] = useState('');
  const [expiry, setExpiry] = useState('30');
  const [invitation, setInvitation] = useState<any>();
  const [review, setReview] = useState<any>();
  const [reviewed, setReviewed] = useState(false);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function load() {
    const [nextSuppliers, nextModels, nextRequests] = await Promise.all([
      apiFetch<any[]>('/suppliers'), apiFetch<any[]>('/battery-models'), apiFetch<any[]>('/supplier-requests'),
    ]);
    setSuppliers(nextSuppliers); setModels(nextModels); setRequests(nextRequests);
  }
  useEffect(() => { load().catch(e => setError(e.message)); }, []);

  async function create(event: FormEvent) {
    event.preventDefault(); setBusy('supplier'); setError(''); setNotice('');
    try {
      await apiFetch('/suppliers', { method: 'POST', body: JSON.stringify({
        legalName: name.trim(), countryCode: country.trim().toUpperCase() || undefined,
        contact: email.trim() ? { email: email.trim() } : undefined,
      }) });
      setName(''); setEmail(''); setCountry(''); setNotice('Supplier added. No message has been sent.'); await load();
    } catch (e: any) { setError(e.message); } finally { setBusy(''); }
  }

  async function createRequest(event: FormEvent) {
    event.preventDefault(); setError(''); setNotice('');
    const fields = fieldIds.trim().split(/[\s,]+/);
    const days = Number(expiry);
    if (!fieldIds.trim() || fields.some(value => !/^\d+$/.test(value) || Number(value) < 1 || Number(value) > 71)) {
      setError('Enter field numbers from 1 to 71, separated by commas.'); return;
    }
    if (!supplierId || !modelId || !Number.isInteger(days) || days < 1 || days > 90) {
      setError('Select a supplier and model, and choose an expiry between 1 and 90 days.'); return;
    }
    setBusy('request'); setInvitation(undefined);
    try {
      const response = await apiFetch('/supplier-requests', { method: 'POST', body: JSON.stringify({
        supplierId, modelId, fieldDefinitionIds: [...new Set(fields.map(Number))],
        message: message.trim() || undefined, expiresInDays: days,
      }) });
      setInvitation(response); setNotice('Private invitation link created. It has not been sent.'); await load();
    } catch (e: any) { setError(e.message); } finally { setBusy(''); }
  }

  async function copyInvitation() {
    try {
      await navigator.clipboard.writeText(invitation.inviteUrl);
      setNotice('Invitation copied. Share it only with the intended supplier contact.');
    } catch { setError('Copy is unavailable. Select and copy the private link below manually.'); }
  }

  async function openReview(id: string) {
    setBusy('review'); setError(''); setReviewed(false); setReview(undefined);
    try { setReview(await apiFetch('/supplier-requests/' + id)); }
    catch (e: any) { setError(e.message); } finally { setBusy(''); }
  }

  async function acceptReview() {
    if (!reviewed || !review || !['submitted', 'partially_submitted'].includes(review.status)) return;
    setBusy('accept'); setError(''); setNotice('');
    try {
      const result = await apiFetch('/supplier-requests/' + review.id + '/accept', { method: 'POST', body: '{}' });
      setNotice(result.acceptedValues + ' supplier values imported for review. They remain unvalidated; evidence verification and separate value validation are still required.');
      setReview(undefined); setReviewed(false); await load();
    } catch (e: any) { setError(e.message); } finally { setBusy(''); }
  }
  async function reviewDocument(id: string) {
    setBusy('document'); setError(''); setNotice(''); setReviewed(false);
    try { await downloadEvidence(id); setNotice('Source download initiated. Read the document before reviewing the declarations.'); }
    catch (e: any) { setError(e.message); } finally { setBusy(''); }
  }

  return <AppShell>
    <section className="pageHead"><div><div className="kicker">SUPPLIER DATA ROOM</div><h1>Chase evidence at the source.</h1><p>Request specific model data, inspect supplier submissions and import them for review. Supplier declarations do not become validated facts automatically.</p></div><button className="button secondary" disabled={Boolean(busy)} onClick={() => load().catch(e => setError(e.message))}>Refresh</button></section>
    {error && <div className="alert" role="alert">{error}</div>}
    {notice && <div className="notice" role="status">{notice}</div>}
    <div className="twoCol">
      <section className="panel"><h2>Add supplier</h2><form onSubmit={create}>
        <label>Legal name<input value={name} onChange={e => setName(e.target.value)} placeholder="Cell / pack supplier" required /></label>
        <label>Contact email<input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="compliance@supplier.com" /></label>
        <label>Country code, if known<input value={country} onChange={e => setCountry(e.target.value.toUpperCase())} maxLength={2} pattern="[A-Za-z]{2}" placeholder="For example: CN" /></label>
        <button className="button" disabled={!name.trim() || Boolean(busy)} type="submit">Add supplier</button>
      </form></section>
      <section className="panel"><h2>Request model data</h2><form onSubmit={createRequest}>
        <label>Supplier<select value={supplierId} onChange={e => setSupplierId(e.target.value)} required><option value="">Select supplier</option>{suppliers.map(s => <option key={s.id} value={s.id}>{s.legalName}</option>)}</select></label>
        <label>Battery model<select value={modelId} onChange={e => setModelId(e.target.value)} required><option value="">Select battery model</option>{models.map(m => <option key={m.id} value={m.id}>{m.modelIdentifier}{m.name ? ' · ' + m.name : ''}</option>)}</select></label>
        <label>Requested field numbers<input value={fieldIds} onChange={e => setFieldIds(e.target.value)} placeholder="For example: 11, 12, 26" required /><small>Choose fields 1–71 from the <Link href="/models">data checklist</Link>.</small></label>
        <label>Supplier instructions<textarea value={message} onChange={e => setMessage(e.target.value)} maxLength={4000} /></label>
        <label>Link expiry in days<input type="number" min="1" max="90" value={expiry} onChange={e => setExpiry(e.target.value)} required /></label>
        <button className="button" disabled={Boolean(busy) || !supplierId || !modelId || !fieldIds.trim()} type="submit">{busy === 'request' ? 'Creating link…' : 'Create private invitation'}</button>
        <p>The link is generated once. No email is sent automatically.</p>
      </form></section>
    </div>
    {invitation && <section className="panel"><h2>Private supplier invitation</h2><p>This link is not sent. It appears only in this session and cannot be recovered from the request list. Share it with the intended contact using your approved channel, then hide it.</p>
      <label>Invitation link<textarea readOnly value={invitation.inviteUrl} aria-label="Private supplier invitation link" /></label>
      <div className="filters"><button className="button" onClick={copyInvitation}>Copy private link</button><button className="button secondary" onClick={() => setInvitation(undefined)}>Hide invitation link</button></div>
    </section>}
    <section className="panel"><h2>Suppliers</h2><div className="rows">{suppliers.map(s => <div className="row" key={s.id}><div><strong>{s.legalName}</strong><span>{s.contacts?.[0]?.email || 'No contact yet'}</span></div><div className="rowMeta"><span>{s._count?.requests || 0} requests</span><span>{s._count?.evidence || 0} evidence objects</span></div></div>)}{!suppliers.length && <div className="empty">No suppliers yet.</div>}</div></section>
    <section className="panel"><h2>Recent data requests</h2><div className="rows">{requests.map(r => <div className="row" key={r.id}><div><strong>{r.supplier?.legalName}</strong><span>{r.model?.modelIdentifier} · {r.fields?.length} requested points · {r._count?.submissions || 0} submissions</span></div><div className="rowMeta"><span className="badge neutral">{labels[r.status] || r.status}</span><button className="button secondary" disabled={Boolean(busy)} onClick={() => openReview(r.id)}>Review request</button></div></div>)}{!requests.length && <div className="empty">No supplier requests yet.</div>}</div></section>
    {review && <section className="panel"><div className="panelHead"><div><h2>Review supplier declarations</h2><p>{review.supplier?.legalName} · {review.model?.modelIdentifier} · {labels[review.status] || review.status}</p></div><button className="button secondary" disabled={Boolean(busy)} onClick={() => { setReview(undefined); setReviewed(false); }}>Close review</button></div>
      <p>These are supplier declarations. Check the model, values, units and supporting documents before importing them. Importing does not verify evidence or validate any passport value.</p>
      <div className="rows">{review.submissions.map((submission: any) => <article className="row" key={submission.id}><div><strong>Field {submission.fieldDefinitionId}{submission.unit ? ' · ' + submission.unit : ''}</strong><pre className="log">{displayValue(submission.valueJson)}</pre>{submission.attestationText && <p>{submission.attestationText}</p>}<span>{submission.evidence.length ? 'Evidence references:' : 'No evidence attached.'}</span>{submission.evidence.map((link: any) => <div className="evidenceReview" key={link.evidenceId}><span>{link.evidence?.originalFilename || link.evidenceId} · {link.evidence?.verificationStatus || 'Unknown status'}</span><button className="button secondary" disabled={Boolean(busy)} onClick={() => reviewDocument(link.evidenceId)}>Download source document</button></div>)}</div></article>)}{!review.submissions.length && <div className="empty">No supplier declarations have been submitted.</div>}</div>
      {['submitted', 'partially_submitted'].includes(review.status) && review.submissions.length > 0 && <div>
        <label className="checkLabel"><input type="checkbox" checked={reviewed} onChange={e => setReviewed(e.target.checked)} /> I reviewed these declarations and want to import them as unvalidated supplier values.</label>
        <button className="button" disabled={Boolean(busy) || !reviewed} onClick={acceptReview}>{busy === 'accept' ? 'Importing…' : 'Import declarations for review'}</button>
      </div>}
    </section>}
  </AppShell>;
}
