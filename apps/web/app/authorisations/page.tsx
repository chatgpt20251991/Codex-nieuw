'use client';
import { FormEvent, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import AppShell from '../../components/AppShell';
import { apiFetch } from '../../lib/api';
import { AUTHORISATION_GROUPS, authorisationStatus, createAuthorisationRequests, parseAuthorisation,
  parseAuthorisationEvidence, parseAuthorisations, prepareAuthorisation,
  type Authorisation, type AuthorisationAction, type AuthorisationEvidence, type AuthorisationInput } from '../../lib/authorisations';

type Organisation = { id: string; legalName: string };
type Review = { kind: 'create'; input: AuthorisationInput } | { kind: 'revoke'; grant: Authorisation };
const actionLabels = Object.fromEntries(AUTHORISATION_GROUPS.flatMap(group => group.actions.map(([name, label]) => [name, label])));
const time = (value: string | null) => value ? new Date(value).toLocaleString() : 'No end date';
function message(error: unknown, mutation = false) {
  const code = error instanceof Error ? error.message : '';
  if (/ROLE_FORBIDDEN|role is not permitted|HTTP 403|DELEGATION_NOT_ALLOWED|responsible organisation/i.test(code)) return 'Authorisation management requires an operator administrator in their own organisation. Return to your own workspace or contact your administrator.';
  if (/HTTP 401|Unauthorized|session/i.test(code)) return 'Your session is unavailable. Sign in again, then refresh authorisations.';
  if (code === 'AUTHORISATION_IDENTIFIERS_REQUIRED') return 'Enter the service provider and evidence IDs. The provider must be a different organisation.';
  if (code === 'AUTHORISATION_INTERVAL_INVALID') return 'Choose an end date after the start date and the current time.';
  if (code === 'AUTHORISATION_SCOPES_REQUIRED') return 'Choose at least one explicit permitted action.';
  if (code === 'AUTHORISATION_EXCEEDS_EVIDENCE_VALIDITY') return 'Choose an authorisation interval within the supporting document\'s validity, then review it again.';
  if (/VERIFIED_AUTHORISATION_EVIDENCE_REQUIRED|EVIDENCE_NOT_READY/i.test(code)) return 'The authorisation document is not eligible. Complete its integrity, security and human review checks, then refresh.';
  if (code === 'AUTHORISATION_RESPONSE_INVALID') return 'The response could not be safely matched to this organisation. Refresh before continuing.';
  return mutation ? 'The request could not be confirmed. It may have completed. Refresh and inspect the current records before trying again.'
    : 'Authorisations could not be loaded. No previous organisation data is retained. Please try again.';
}

export default function Authorisations() {
  const [organisation, setOrganisation] = useState<Organisation>();
  const [rows, setRows] = useState<Authorisation[]>([]);
  const [evidence, setEvidence] = useState<AuthorisationEvidence[]>([]);
  const [hasOlder, setHasOlder] = useState(false);
  const [providerId, setProviderId] = useState('');
  const [evidenceId, setEvidenceId] = useState('');
  const [selected, setSelected] = useState<AuthorisationAction[]>([]);
  const [validFrom, setValidFrom] = useState('');
  const [validUntil, setValidUntil] = useState('');
  const [acknowledged, setAcknowledged] = useState(false);
  const [review, setReview] = useState<Review>();
  const [revokeAcknowledged, setRevokeAcknowledged] = useState(false);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const requests = useRef(createAuthorisationRequests());
  const operation = useRef(false);

  function clearForm() {
    setProviderId(''); setEvidenceId(''); setSelected([]); setValidFrom(''); setValidUntil('');
    setAcknowledged(false); setReview(undefined); setRevokeAcknowledged(false);
  }
  function clearData() {
    setRows([]); setEvidence([]); setOrganisation(undefined); setHasOlder(false); setReady(false); clearForm();
  }
  async function load(successNotice = '', older?: { rows: Authorisation[]; organisationId: string }) {
    const request = requests.current.start(); operation.current = true;
    setBusy(true); setError(''); setNotice(''); clearData();
    try {
      const own = await apiFetch<Organisation>('/organisations/current', { signal: request.signal });
      if (!request.current()) return;
      if (!own || typeof own.id !== 'string' || typeof own.legalName !== 'string'
        || (older && older.organisationId !== own.id)) throw new Error('AUTHORISATION_RESPONSE_INVALID');
      const cursor = older?.rows[older.rows.length - 1]?.id;
      const [grants, documents] = await Promise.all([
        apiFetch<unknown>(`/authorisations?limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`, { signal: request.signal }),
        apiFetch<unknown>('/evidence?limit=100', { signal: request.signal }),
      ]);
      if (!request.current()) return;
      const page = parseAuthorisations(grants, own.id), combined = [...(older?.rows || []), ...page];
      // Recheck all rows when appending a page; duplicate/cross-tenant records
      // never enter the displayed list even if a response shape is malformed.
      const checked = parseAuthorisations(combined, own.id);
      setOrganisation({ id: own.id, legalName: own.legalName }); setRows(checked);
      setEvidence(parseAuthorisationEvidence(documents)); setHasOlder(page.length === 100); setReady(true); setNotice(successNotice);
    } catch (cause) {
      if (request.current()) { clearData(); setError(message(cause)); }
    } finally {
      if (request.current()) { operation.current = false; setBusy(false); }
    }
  }
  useEffect(() => {
    load();
    const invalidate = () => {
      requests.current.invalidate(); operation.current = false; clearData(); setBusy(false); setNotice('');
      setError('Your session or workspace changed. Refresh authorisations before continuing.');
    };
    const storage = (event: StorageEvent) => {
      if (process.env.NODE_ENV === 'development' && (!event.key || ['eubp_token', 'eubp_acting_org'].includes(event.key))) invalidate();
    };
    window.addEventListener('eubp-session-expired', invalidate); window.addEventListener('storage', storage);
    return () => { requests.current.invalidate(); window.removeEventListener('eubp-session-expired', invalidate); window.removeEventListener('storage', storage); };
  }, []);

  function reviewCreate(event: FormEvent) {
    event.preventDefault(); if (operation.current || !ready || !organisation || !acknowledged) return;
    setError(''); setNotice('');
    try { setReview({ kind: 'create', input: prepareAuthorisation({ serviceProviderId: providerId, evidenceId,
      selected, validFrom, validUntil }, organisation.id) }); }
    catch (cause) { setError(message(cause)); }
  }
  function reviewRevoke(row: Authorisation) {
    if (operation.current || !ready || row.revokedAt) return;
    setReview({ kind: 'revoke', grant: row }); setRevokeAcknowledged(false); setError(''); setNotice('');
  }
  async function confirm() {
    if (operation.current || !organisation || !review || !ready || (review.kind === 'revoke' && !revokeAcknowledged)) return;
    const currentOrganisation = organisation.id, decision = review;
    if (decision.kind === 'create' && Date.parse(decision.input.validUntil) <= Date.now()) {
      setReview(undefined); setAcknowledged(false); setError('The proposed end date has passed. Choose a new interval and review it again.'); return;
    }
    const request = requests.current.start(); operation.current = true;
    setBusy(true); setError(''); setNotice('');
    // Remove every editable or pending copy before sending a security-sensitive
    // request; a failed or uncertain result requires a fresh review, not retry.
    clearForm(); setReady(false); setRows([]); setEvidence([]); setHasOlder(false);
    try {
      const result = await apiFetch<unknown>(decision.kind === 'create' ? '/authorisations' : `/authorisations/${decision.grant.id}/revoke`, {
        method: 'POST', signal: request.signal,
        ...(decision.kind === 'create' ? { body: JSON.stringify(decision.input) } : {}),
      });
      if (!request.current()) return;
      const row = parseAuthorisation(result, currentOrganisation);
      if (decision.kind === 'create' ? row.serviceProviderId !== decision.input.serviceProviderId || !row.scopeValid || row.revokedAt !== null
        || Date.parse(row.validFrom) !== Date.parse(decision.input.validFrom) || row.validUntil === null
        || Date.parse(row.validUntil) !== Date.parse(decision.input.validUntil)
        || JSON.stringify(Object.entries(row.scopeJson).sort()) !== JSON.stringify(Object.entries(decision.input.scope).sort())
        : row.id !== decision.grant.id || row.serviceProviderId !== decision.grant.serviceProviderId || row.revokedAt === null) {
        throw new Error('AUTHORISATION_RESPONSE_INVALID');
      }
      await load(decision.kind === 'create' ? 'Authorisation created. The service provider can use only the selected actions while the grant is valid.'
        : 'Authorisation revoked. New delegated transactions are denied; previously completed actions and issued links are not recalled.');
    } catch (cause) {
      if (request.current()) { clearData(); setError(message(cause, true)); }
    } finally {
      if (request.current()) { operation.current = false; setBusy(false); }
    }
  }

  const eligible = evidence.filter(row => row.eligibleForAuthorisation);
  return <AppShell>
    <section className="pageHead"><div><div className="kicker">WRITTEN AUTHORISATIONS</div><h1>Control who can act for your organisation.</h1>
      <p>Grant specific actions to a service provider after reviewing the signed authorisation. Read, edit, review, publish and export are separate permissions.</p></div>
      <button type="button" className="button secondary" disabled={busy} onClick={() => load()}>Refresh authorisations</button></section>
    {error && <div className="alert" role="alert">{error}</div>}
    {notice && <div className="notice" role="status">{notice}</div>}
    {busy && <div className="notice" role="status">Checking authorisations…</div>}
    {organisation && <section className="panel"><h2>{organisation.legalName}</h2><p>Managing authorisations for your own organisation.</p><div className="tiny hashText">Organisation ID: {organisation.id}</div></section>}
    <section className="panel"><h2>Issue an authorisation</h2>
      <p>Choose only the actions covered by the written agreement. These permissions apply across this organisation, not just one battery. They never bypass review or publication checks.</p>
      <form onSubmit={reviewCreate}>
        <fieldset disabled={!ready || busy || Boolean(review)} className="authorisationFields">
          <label>Service provider organisation ID<input required value={providerId} onChange={event => setProviderId(event.target.value)} autoComplete="off" spellCheck={false} maxLength={36} placeholder="Provider organisation UUID" /></label>
          <label>Reviewed authorisation document<select value={evidence.some(row => row.id === evidenceId && row.eligibleForAuthorisation) ? evidenceId : ''} onChange={event => setEvidenceId(event.target.value)}>
            <option value="">Choose an eligible document</option>{eligible.map(row => <option key={row.id} value={row.id}>{row.originalFilename} · {row.id}</option>)}</select></label>
          <p className="tiny">The latest 100 documents are checked. No document is selected automatically. Upload and review evidence before granting access; the server checks its current eligibility again.</p>
          <label>Authorisation evidence ID<input required value={evidenceId} onChange={event => setEvidenceId(event.target.value)} autoComplete="off" spellCheck={false} maxLength={36} placeholder="Verified evidence UUID" /></label>
          <p className="tiny">You can enter the ID of an older reviewed document. <Link href="/evidence">Manage source documents</Link>.</p>
          <div className="twoCol authorisationDates">
            <label>Starts at, optional<input type="datetime-local" aria-label="Starts at, optional" value={validFrom} onChange={event => setValidFrom(event.target.value)} /><span className="tiny">Leave empty to start when reviewed. Times use your device&apos;s local time zone.</span></label>
            <label>Ends at<input type="datetime-local" aria-label="Ends at" required value={validUntil} onChange={event => setValidUntil(event.target.value)} /><span className="tiny">Every authorisation created here has an explicit end date.</span></label>
          </div>
          {AUTHORISATION_GROUPS.map(group => <fieldset key={group.name} className="authorisationPermissions">
            <legend>{group.name}</legend>{group.actions.map(([name, label]) => <label className="checkLabel" key={name}>
              <input type="checkbox" checked={selected.includes(name)} onChange={event => setSelected(previous => event.target.checked ? [...previous, name] : previous.filter(action => action !== name))} /><span>{label}</span></label>)}
          </fieldset>)}
          <p className="tiny">Private exports can disclose information from every passport access tier. Grant this action only when the agreement covers that disclosure. Registry actions remain subject to the separate availability and identity gates.</p>
          <label className="checkLabel"><input type="checkbox" checked={acknowledged} onChange={event => setAcknowledged(event.target.checked)} /><span>I have reviewed the written agreement, the provider identity, the document and these exact permissions and dates.</span></label>
          <button type="submit" className="button" disabled={!acknowledged || !selected.length || !providerId.trim() || !evidenceId.trim() || !validUntil}>Review authorisation</button>
        </fieldset>
      </form>
    </section>
    {review && <section className="panel" role="region" aria-label={review.kind === 'create' ? 'Confirm new authorisation' : 'Confirm authorisation revocation'}>
      <h2>{review.kind === 'create' ? 'Confirm these exact permissions' : 'Revoke this authorisation?'}</h2>
      <dl className="passportMetadata">
        <dt>Service provider ID</dt><dd>{review.kind === 'create' ? review.input.serviceProviderId : review.grant.serviceProviderId}</dd>
        {review.kind === 'create' ? <><dt>Evidence ID</dt><dd>{review.input.evidenceId}</dd><dt>Starts</dt><dd>{time(review.input.validFrom)}</dd><dt>Ends</dt><dd>{time(review.input.validUntil)}</dd></>
          : <><dt>Authorisation ID</dt><dd>{review.grant.id}</dd><dt>Current status</dt><dd>{authorisationStatus(review.grant)}</dd></>}
      </dl>
      {review.kind === 'create' ? <><h3>Actions to grant</h3><ul>{Object.keys(review.input.scope).map(action => <li key={action}>{actionLabels[action]}</li>)}</ul>
        <p>No other action is included. Nothing has been granted until you confirm below.</p></>
        : <><p>New delegated transactions under this grant will be denied after revocation. Completed actions and existing download or capability links are not recalled.</p>
          <label className="checkLabel"><input type="checkbox" checked={revokeAcknowledged} onChange={event => setRevokeAcknowledged(event.target.checked)} /><span>I confirm revocation of this exact authorisation and service provider.</span></label></>}
      <div className="workflowActions"><button type="button" className="button" disabled={busy || (review.kind === 'revoke' && !revokeAcknowledged)} onClick={confirm}>{review.kind === 'create' ? 'Confirm and grant selected actions' : 'Confirm revocation'}</button>
        <button type="button" className="button secondary" disabled={busy} onClick={() => { setReview(undefined); setRevokeAcknowledged(false); setAcknowledged(false); }}>Cancel review</button></div>
    </section>}
    <section className="panel"><h2>Recorded authorisations</h2><p>Historical and invalid grants remain visible. A legacy grant must be reviewed and explicitly reissued; it is never converted into broader permissions automatically.</p>
      {!ready ? <p>Refresh after signing in with your operator administrator account.</p> : !rows.length ? <p>No authorisations found for your organisation.</p> : <div className="rows">{rows.map(row => <article className="evidenceReview" key={row.id}>
        <div className="panelHead"><div><strong className="hashText">Provider {row.serviceProviderId}</strong><div className="tiny hashText">Authorisation {row.id}</div></div><span className="badge neutral">{authorisationStatus(row)}</span></div>
        <p>Starts {time(row.validFrom)} · Ends {time(row.validUntil)}{row.revokedAt ? ` · Revoked ${time(row.revokedAt)}` : ''}</p>
        {row.scopeValid ? <ul>{Object.entries(row.scopeJson).filter(([, allowed]) => allowed).map(([action]) => <li key={action}>{actionLabels[action]}</li>)}</ul>
          : <p>This older scope format grants no usable actions. Review the agreement and issue a new authorisation with explicit actions if access is still needed.</p>}
        {!row.revokedAt && <button type="button" className="button secondary" disabled={busy || Boolean(review)} onClick={() => reviewRevoke(row)}>Review revocation</button>}
      </article>)}</div>}
      {ready && hasOlder && rows.length < 1000 && <button type="button" className="button secondary" disabled={busy || Boolean(review)} onClick={() => organisation && load('', { rows, organisationId: organisation.id })}>Load older authorisations</button>}
      {ready && hasOlder && rows.length >= 1000 && <p>This view is limited to 1,000 records. Contact your administrator to review older authorisations through the authenticated management API.</p>}
    </section>
  </AppShell>;
}
