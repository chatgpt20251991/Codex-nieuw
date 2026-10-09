'use client';
import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import AppShell from '../../components/AppShell';
import ComplianceMatrix from '../../components/ComplianceMatrix';
import { apiFetch } from '../../lib/api';

export default function Models() {
  const [models, setModels] = useState<any[]>([]);
  const [selected, setSelected] = useState('');
  const [detail, setDetail] = useState<any>();
  const [conditionalReview, setConditionalReview] = useState<any>();
  const [decisions, setDecisions] = useState<Record<number, { applicable: string; reason: string }>>({});
  const [reviewApproved, setReviewApproved] = useState(false);
  const [identifier, setIdentifier] = useState('');
  const [name, setName] = useState('');
  const [category, setCategory] = useState('LMT');
  const [chemistry, setChemistry] = useState('');
  const [serial, setSerial] = useState('');
  const [batch, setBatch] = useState('');
  const [manufactured, setManufactured] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  async function loadModels() {
    const rows = await apiFetch<any[]>('/battery-models');
    setModels(rows);
    return rows;
  }
  useEffect(() => { loadModels().catch(e => setError(e.message)); }, []);
  useEffect(() => {
    let active = true;
    setDetail(undefined); setConditionalReview(undefined); setDecisions({}); setReviewApproved(false);
    if (selected) Promise.all([apiFetch(`/battery-models/${selected}`), apiFetch(`/compliance/model/${selected}/readiness`)]).then(([row, result]) => {
      if (!active) return;
      setDetail(row); setConditionalReview(result.conditionalReview);
      setDecisions(Object.fromEntries((result.conditionalReview?.fields || []).map((field: any) => [field.fieldId, {
        applicable: typeof field.decision?.applicable === 'boolean' ? String(field.decision.applicable) : '', reason: field.decision?.reason || '',
      }])));
    })
      .catch(e => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [selected]);
  async function createModel(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(''); setNotice('');
    try {
      const model = await apiFetch('/battery-models', { method: 'POST', body: JSON.stringify({
        modelIdentifier: identifier.trim(), name: name.trim() || undefined, category,
        chemistry: chemistry.trim() || undefined,
      }) });
      await loadModels(); setSelected(model.id); setIdentifier(''); setName(''); setChemistry('');
      setNotice(`Model ${model.modelIdentifier} created. Add the actual battery serial number below.`);
    } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  }
  async function createItem(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(''); setNotice('');
    try {
      const item = await apiFetch('/battery-items', { method: 'POST', body: JSON.stringify({
        modelId: selected, serialOrItemIdentifier: serial.trim(), batchIdentifier: batch.trim() || undefined,
        manufactureDate: manufactured || undefined,
      }) });
      setSerial(''); setBatch(''); setManufactured('');
      setDetail(await apiFetch(`/battery-models/${selected}`)); await loadModels();
      setNotice(`Battery ${item.serialOrItemIdentifier} created. Its dossier is still a draft.`);
    } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  }
  async function saveApplicability(event: FormEvent) {
    event.preventDefault(); if (!reviewApproved) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const result = await apiFetch(`/battery-models/${selected}/applicability-review`, { method: 'POST', body: JSON.stringify({
        decisions: conditionalReview.fields.map((field: any) => ({ fieldId: field.fieldId,
          applicable: decisions[field.fieldId]?.applicable === 'true', reason: decisions[field.fieldId]?.reason.trim() })),
      }) });
      setConditionalReview(result.conditionalReview); setReviewApproved(false);
      setDetail(await apiFetch(`/battery-models/${selected}`));
      setNotice('Applicability review recorded for this model. Its batteries require fresh publication checks.');
    } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  }
  const decisionsComplete = Boolean(conditionalReview?.fields.every((field: any) =>
    ['true', 'false'].includes(decisions[field.fieldId]?.applicable) && (decisions[field.fieldId]?.reason.trim().length || 0) >= 10));
  return <AppShell>
    <section className="pageHead"><div><div className="kicker">BATTERY DATA MODEL</div>
      <h1>Models and individual batteries.</h1><p>Enter the model once, then create a separate dossier for each physical battery. Publication requires reviewed data and evidence.</p></div></section>
    {error && <div className="alert" role="alert">{error}</div>}
    {notice && <div className="notice" role="status">{notice}</div>}
    <div className="twoCol">
      <section className="panel"><h2>Create battery model</h2><form onSubmit={createModel}>
        <label>Model identifier<input required value={identifier} onChange={e => setIdentifier(e.target.value)} /></label>
        <label>Model name<input value={name} onChange={e => setName(e.target.value)} /></label>
        <label>Battery category<select aria-label="Battery category" value={category} onChange={e => setCategory(e.target.value)}>
          <option value="LMT">Light means of transport</option><option value="EV">Electric vehicle</option>
          <option value="INDUSTRIAL_GT_2KWH">Industrial above 2 kWh</option></select></label>
        <label>Chemistry, if known<input value={chemistry} onChange={e => setChemistry(e.target.value)} /></label>
        <button className="button" disabled={busy || !identifier.trim()}>Create model</button>
      </form></section>
      <section className="panel"><h2>Create individual battery</h2><form onSubmit={createItem}>
        <label>Battery model<select aria-label="Battery model" required value={selected} disabled={busy} onChange={e => setSelected(e.target.value)}>
          <option value="">Select a model</option>{models.map(m => <option key={m.id} value={m.id}>{m.modelIdentifier}</option>)}</select></label>
        <label>Serial or individual item identifier<input required value={serial} onChange={e => setSerial(e.target.value)} /></label>
        <label>Batch, if known<input value={batch} onChange={e => setBatch(e.target.value)} /></label>
        <label>Manufacture date, if known<input type="date" value={manufactured} onChange={e => setManufactured(e.target.value)} /></label>
        <button className="button" disabled={busy || !selected || !serial.trim()}>Create battery</button>
      </form></section>
    </div>
    <section className="panel"><h2>Your battery models</h2><div className="rows">
      {models.map(m => <div className="row" key={m.id}><div><strong>{m.name || m.modelIdentifier}</strong>
        <span>{m.modelIdentifier} · {m.category} · {m.chemistry || 'Chemistry not supplied'}</span></div>
        <div className="rowMeta"><span>{m._count?.items || 0} batteries</span>
          <button className="button secondary" disabled={busy} onClick={() => setSelected(m.id)}>View batteries</button></div></div>)}
      {!models.length && <div className="empty">No models found. Create the first model above.</div>}
    </div></section>
    {detail && <section className="panel"><h2>Batteries for {detail.modelIdentifier}</h2><div className="rows">
      {detail.items.map((item: any) => <div className="row" key={item.id}><div><strong>{item.serialOrItemIdentifier}</strong>
        <span>{item.passportState} · {item.lifecycleStatus}</span></div>
        <Link className="button secondary" href={`/passports?item=${encodeURIComponent(item.id)}`}>Open dossier</Link></div>)}
      {!detail.items.length && <div className="empty">This model has no batteries yet.</div>}
      {detail.items.length === 100 && <p className="mutedText">Showing the latest 100 batteries. Existing dossiers remain accessible through their saved links.</p>}
    </div></section>}
    {detail && conditionalReview && <section className="panel"><h2>Model applicability review</h2>
      <p>Assess each conditional data point for {detail.modelIdentifier}. Unknown conditions block publication. Record the source and reason for each decision; a decision applies to all batteries of this model.</p>
      <p className="mutedText">{conditionalReview.complete ? 'A complete review is recorded.' : 'This model still needs an applicability review.'}</p>
      <form onSubmit={saveApplicability}>
        {conditionalReview.fields.map((field: any) => <fieldset className="evidenceReview" key={field.fieldId}>
          <legend>{field.fieldId}. {field.name}</legend><p className="mutedText">{field.requirement}</p>
          <label>Applicability<select aria-label={`Applicability for point ${field.fieldId}`} disabled={busy}
            value={decisions[field.fieldId]?.applicable || ''} onChange={e => { setReviewApproved(false); setDecisions(current => ({ ...current,
              [field.fieldId]: { ...current[field.fieldId], applicable: e.target.value } })); }} required>
            <option value="">Not assessed</option><option value="true">Applies to this model</option><option value="false">Does not apply to this model</option>
          </select></label>
          <label>Reason and source<textarea aria-label={`Reason and source for point ${field.fieldId}`} disabled={busy} minLength={10} maxLength={1000} required
            value={decisions[field.fieldId]?.reason || ''} onChange={e => { setReviewApproved(false); setDecisions(current => ({ ...current,
              [field.fieldId]: { ...current[field.fieldId], reason: e.target.value } })); }} /></label>
        </fieldset>)}
        <label className="checkLabel"><input type="checkbox" disabled={busy || !decisionsComplete} checked={reviewApproved} onChange={e => setReviewApproved(e.target.checked)} />
          I have assessed each condition against this model and approve the recorded decisions.</label>
        <button className="button" disabled={busy || !decisionsComplete || !reviewApproved}>Record applicability review</button>
      </form>
    </section>}
    <ComplianceMatrix />
  </AppShell>;
}
