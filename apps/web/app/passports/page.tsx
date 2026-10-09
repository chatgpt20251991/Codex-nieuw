'use client';
import { FormEvent, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import AppShell from '../../components/AppShell';
import { apiFetch } from '../../lib/api';
import { parsePassportInput, publicPassportLink, ValueKind } from '../../lib/passport-input';

function download(content: string, filename: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = filename;
  document.body.appendChild(anchor); anchor.click(); anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function Passports() {
  const [itemId, setItemId] = useState('');
  const [itemInput, setItemInput] = useState('');
  const [item, setItem] = useState<any>();
  const [model, setModel] = useState<any>();
  const [fields, setFields] = useState<any[]>([]);
  const [validation, setValidation] = useState<any>();
  const [fieldId, setFieldId] = useState(1);
  const [scope, setScope] = useState('item');
  const [kind, setKind] = useState<ValueKind>('text');
  const [input, setInput] = useState('');
  const [unit, setUnit] = useState('');
  const [valueDetail, setValueDetail] = useState<any>();
  const [evidenceId, setEvidenceId] = useState('');
  const [reviewedEvidence, setReviewedEvidence] = useState<Record<string, boolean>>({});
  const [publicationConfirmed, setPublicationConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const sequence = useRef(0);
  const currentValue = (scope === 'model' ? model?.values : item?.values)?.find((v: any) => v.fieldDefinitionId === fieldId);
  const definition = fields.find(f => f.id === fieldId);
  const publicLink = publicPassportLink(item?.upi);
  const mergedValues = new Map<number, any>();
  for (const value of model?.values || []) mergedValues.set(value.fieldDefinitionId, { ...value, scope: 'model' });
  for (const value of item?.values || []) mergedValues.set(value.fieldDefinitionId, { ...value, scope: 'item' });

  async function load(id: string) {
    const request = ++sequence.current;
    // Clear the previous battery before fetching so an error cannot leave an
    // old dossier usable under a new item identifier.
    setItem(undefined); setModel(undefined); setValidation(undefined); setValueDetail(undefined);
    setPublicationConfirmed(false); setReviewedEvidence({});
    const row = await apiFetch(`/battery-items/${encodeURIComponent(id)}`);
    const [m, defs, result] = await Promise.all([
      apiFetch(`/battery-models/${row.modelId}`), apiFetch<any[]>(`/compliance/fields?category=${row.model.category}`),
      apiFetch(`/passports/${id}/validate`),
    ]);
    if (request !== sequence.current) return;
    setItem(row); setModel(m); setFields(defs); setValidation(result); setItemId(id); setItemInput(id);
  }
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('item');
    if (id) load(id).catch(e => setError(e.message));
  }, []);
  useEffect(() => {
    let active = true; setValueDetail(undefined); setEvidenceId(''); setReviewedEvidence({});
    if (currentValue) {
      const value = currentValue.valueJson;
      setKind(typeof value === 'number' ? 'number' : typeof value === 'boolean' ? 'boolean' : typeof value === 'object' ? 'structured' : 'text');
      setInput(typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value));
      setUnit(currentValue.unit || '');
      apiFetch(`/passport-values/${currentValue.id}`).then(row => { if (active) setValueDetail(row); })
        .catch(e => { if (active) setError(e.message); });
    } else { setInput(''); setUnit(''); setKind('text'); }
    return () => { active = false; };
  }, [currentValue?.id, fieldId, scope]);

  async function run(action: () => Promise<void>) {
    setBusy(true); setError(''); setNotice(''); setPublicationConfirmed(false);
    try { await action(); } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  }
  async function open(event: FormEvent) {
    event.preventDefault();
    await run(async () => {
      if (!/^[0-9a-f-]{36}$/i.test(itemInput)) throw new Error('Enter the item ID from the battery list.');
      await load(itemInput);
      window.history.replaceState(null, '', `/passports?item=${encodeURIComponent(itemInput)}`);
    });
  }
  async function save(event: FormEvent) {
    event.preventDefault(); await run(async () => {
      const value = parsePassportInput(input, kind);
      await apiFetch('/passport-values', { method: 'POST', body: JSON.stringify({
        ...(scope === 'model' ? { modelId: model.id } : { batteryItemId: itemId }),
        fieldDefinitionId: fieldId, value, unit: unit.trim() || undefined, sourceKind: 'operator',
      }) });
      await load(itemId); setNotice('Value saved for review. Previous publication versions remain unchanged.');
    });
  }
  async function linkEvidence(event: FormEvent) {
    event.preventDefault(); await run(async () => {
      await apiFetch('/evidence/link', { method: 'POST', body: JSON.stringify({
        passportValueId: currentValue.id, evidenceId: evidenceId.trim(), relationship: 'supports',
      }) });
      await load(itemId);
      setValueDetail(await apiFetch(`/passport-values/${currentValue.id}`));
      setNotice('Evidence linked. Upload and linking do not verify the document.');
    });
  }
  async function verifyEvidence(id: string) {
    await run(async () => {
      await apiFetch(`/evidence/${id}/verify`, { method: 'POST' });
      setValueDetail(await apiFetch(`/passport-values/${currentValue.id}`));
      setReviewedEvidence({}); setValidation(await apiFetch(`/passports/${itemId}/validate`));
      setNotice('Evidence verification recorded. The value still needs its own validation.');
    });
  }
  async function validateValue() {
    await run(async () => {
      await apiFetch(`/passport-values/${currentValue.id}/validate`, { method: 'POST' });
      await load(itemId); setNotice('Value validation recorded. Run the complete passport check before publication.');
    });
  }
  async function validatePassport() {
    await run(async () => {
      const result = await apiFetch(`/passports/${itemId}/validate`, { method: 'POST' });
      await load(itemId); setValidation(result);
      setNotice(result.publishable ? 'Publication checks passed for the current data.' : 'Publication is blocked. Resolve the issues below.');
    });
  }
  async function publish() {
    if (!publicationConfirmed) return;
    await run(async () => {
      const result = await apiFetch(`/passports/${itemId}/publish`, { method: 'POST' });
      await load(itemId); setNotice(`Version ${result.version.versionNo} published. EU registration is a separate process.`);
    });
  }
  async function downloadQr() {
    await run(async () => {
      const svg = await apiFetch<string>(`/passports/${itemId}/qr.svg`);
      download(svg, 'battery-passport-qr.svg', 'image/svg+xml');
      setNotice('QR downloaded for the published battery. Check its scan destination before printing.');
    });
  }
  const canPublish = Boolean(validation?.publishable && ['ready', 'updated'].includes(item?.passportState));
  return <AppShell>
    <section className="pageHead"><div><div className="kicker">PASSPORT DOSSIER</div><h1>Review, validate and publish.</h1>
      <p>Each physical battery has its own dossier. Model values are inherited; individual battery values take precedence.</p></div></section>
    {error && <div className="alert" role="alert">{error}</div>}
    {notice && <div className="notice" role="status">{notice}</div>}
    <section className="panel"><form onSubmit={open}><label>Battery item ID<input value={itemInput} onChange={e => setItemInput(e.target.value)} required /></label>
      <div className="workflowActions"><button className="button secondary" disabled={busy}>Open battery dossier</button>
        <Link href="/models">Choose or create a battery</Link></div></form></section>
    {item && <>
      <section className="panel"><h2>{item.serialOrItemIdentifier}</h2>
        <p className="mutedText">{model.modelIdentifier} · {model.category} · Passport: {item.passportState} · Lifecycle: {item.lifecycleStatus}</p>
        <p className="mutedText">{item.passportState === 'registered' ? 'The API records a registered state.' : 'No successful EU registration is recorded for this battery.'}</p>
      </section>
      <div className="twoCol">
        <section className="panel"><h2>Data point</h2><form onSubmit={save}>
          <label>Passport data point<select value={fieldId} disabled={busy} onChange={e => setFieldId(Number(e.target.value))}>
            {fields.map(f => <option key={f.id} value={f.id}>{f.id}. {f.name}</option>)}</select></label>
          <p className="mutedText">{definition?.currentRequirement} · {definition?.access_tier} · {definition?.legal_source}</p>
          <label>Value applies to<select value={scope} disabled={busy} onChange={e => setScope(e.target.value)}>
            <option value="item">This individual battery</option><option value="model">All batteries of this model</option></select></label>
          {scope === 'model' && <p className="mutedText">Changing a model value requires fresh publication checks for its batteries.</p>}
          <label>Value format<select value={kind} disabled={busy} onChange={e => { setKind(e.target.value as ValueKind); setInput(e.target.value === 'boolean' ? 'true' : ''); }}>
            <option value="text">Text</option><option value="number">Number</option><option value="boolean">Yes / no</option><option value="structured">Structured object or list</option></select></label>
          <label>Passport value{kind === 'boolean' ? <select value={input} onChange={e => setInput(e.target.value)}><option value="true">Yes</option><option value="false">No</option></select>
            : <textarea required value={input} onChange={e => setInput(e.target.value)} />}</label>
          {kind === 'structured' && <p className="mutedText">Enter the agreed structured object or list as JSON; preserve the source structure.</p>}
          <label>Unit, where applicable<input value={unit} onChange={e => setUnit(e.target.value)} placeholder="For example kg, Ah or V" /></label>
          <button className="button" disabled={busy || !input.trim()}>Save value for review</button>
        </form></section>
        <section className="panel"><h2>Evidence and review</h2>
          {!currentValue ? <p className="mutedText">Save a value at the selected scope before attaching evidence. A model value can also be reviewed by selecting the model scope.</p> : <>
            <p className="mutedText">Value status: {currentValue.validationStatus}</p>
            <form onSubmit={linkEvidence}><label>Evidence ID<input required value={evidenceId} onChange={e => setEvidenceId(e.target.value)} /></label>
              <div className="workflowActions"><button className="button secondary" disabled={busy || !evidenceId.trim()}>Link evidence</button><Link href="/evidence">Upload a source document</Link></div></form>
            {(valueDetail?.evidenceLinks || []).map((link: any) => <div className="evidenceReview" key={link.evidenceId}>
              <strong>{link.evidence?.originalFilename || link.evidenceId}</strong>
              <p className="mutedText">Verification: {link.evidence?.verificationStatus} · Malware scan recorded: {link.evidence?.malwareScannedAt || 'Not recorded'}</p>
              <label className="checkLabel"><input type="checkbox" checked={Boolean(reviewedEvidence[link.evidenceId])}
                onChange={e => setReviewedEvidence(v => ({ ...v, [link.evidenceId]: e.target.checked }))} />
                I have reviewed this source document and its relevance to this value.</label>
              <button className="button secondary" disabled={busy || !reviewedEvidence[link.evidenceId]} onClick={() => verifyEvidence(link.evidenceId)}>Record evidence verification</button>
            </div>)}
            {valueDetail && !valueDetail.evidenceLinks.length && <p className="mutedText">No evidence linked yet.</p>}
            <div className="workflowActions"><button className="button" disabled={busy || !valueDetail?.evidenceLinks.length} onClick={validateValue}>Validate selected value</button></div>
          </>}
        </section>
      </div>
      <section className="panel"><h2>Current dossier values</h2><div className="tableWrap"><table>
        <thead><tr><th>Point</th><th>Value</th><th>Scope</th><th>Review</th><th>Evidence</th><th>Action</th></tr></thead>
        <tbody>{[...mergedValues.values()].sort((a, b) => a.fieldDefinitionId - b.fieldDefinitionId).map(value => <tr key={value.id}>
          <td>{value.fieldDefinitionId}. {fields.find(f => f.id === value.fieldDefinitionId)?.name}</td>
          <td className="hashText">{typeof value.valueJson === 'object' ? JSON.stringify(value.valueJson) : String(value.valueJson)} {value.unit}</td>
          <td>{value.scope}</td><td>{value.validationStatus}</td><td>{value.evidenceLinks?.length || 0} linked</td>
          <td><button className="button secondary" disabled={busy} onClick={() => { setFieldId(value.fieldDefinitionId); setScope(value.scope); }}>Review point {value.fieldDefinitionId}</button></td>
        </tr>)}</tbody>
      </table></div>{!mergedValues.size && <p className="mutedText">No values supplied yet.</p>}</section>
      <section className="panel"><h2>Complete passport check</h2>
        <p className="mutedText">{validation?.publishable ? 'Current data passes publication checks.' : 'Publication is blocked.'}
          {' '}Data completeness: {validation?.readiness?.score ?? 0}%. Completeness alone does not establish publishability.</p>
        <div className="workflowActions"><button className="button secondary" disabled={busy} onClick={validatePassport}>Validate passport</button></div>
        <ul className="blockerList">{validation?.publicationBlockers?.map((issue: any, i: number) => <li key={i}>{issue.fieldId ? `Point ${issue.fieldId}: ` : ''}{issue.message}</li>)}</ul>
        <label className="checkLabel"><input type="checkbox" checked={publicationConfirmed} disabled={busy || !canPublish} onChange={e => setPublicationConfirmed(e.target.checked)} />
          I approve publication of a new immutable version, including the fields marked public.</label>
        <button className="button" disabled={busy || !canPublish || !publicationConfirmed} onClick={publish}>Publish passport version</button>
      </section>
      <section className="panel"><h2>Published versions and QR</h2>
        <div className="rows">{item.versions?.map((version: any) => <div className="row" key={version.id}><div><strong>Version {version.versionNo}</strong>
          <span>{version.publicationState} · {version.publishedAt}</span><span className="hashText">SHA-256 {version.sha256}</span></div></div>)}</div>
        {!item.versions?.length ? <p className="mutedText">No version has been published.</p> : <div className="workflowActions">
          <button className="button secondary" disabled={busy} onClick={downloadQr}>Download battery QR</button>
          {publicLink && <a href={publicLink} target="_blank" rel="noopener noreferrer">Latest published public passport</a>}
        </div>}
      </section>
    </>}
  </AppShell>;
}
