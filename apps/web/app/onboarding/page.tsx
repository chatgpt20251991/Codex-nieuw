'use client';
import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import AppShell from '../../components/AppShell';
import DevAuthPanel from '../../components/DevAuthPanel';
import { apiFetch } from '../../lib/api';

export default function Onboarding() {
  const [organisation, setOrganisation] = useState<any>();
  const [checked, setChecked] = useState(false);
  const [orgName, setOrgName] = useState('');
  const [country, setCountry] = useState('');
  const [role, setRole] = useState('');
  const [vatNumber, setVatNumber] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function checkOrganisation() {
    setBusy(true); setError(''); setChecked(false);
    try { setOrganisation(await apiFetch('/organisations/current')); setChecked(true); }
    catch (e: any) {
      if (e.message === 'RESOURCE_NOT_FOUND') { setOrganisation(undefined); setChecked(true); }
      else setError(e.message);
    } finally { setBusy(false); }
  }
  useEffect(() => { checkOrganisation(); }, []);

  async function bootstrap(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(''); setNotice('');
    try {
      const created = await apiFetch('/organisations/bootstrap', { method: 'POST', body: JSON.stringify({
        legalName: orgName.trim(), countryCode: country.trim().toUpperCase(), role,
        vatNumber: vatNumber.trim() || undefined,
      }) });
      setOrganisation(created); setChecked(true);
      setNotice('Organisation workspace created. This does not verify its legal identity or register it with the EU Registry.');
    } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  }

  return <AppShell>
    <section className="pageHead"><div><div className="kicker">CUSTOMER ONBOARDING</div><h1>Set up your battery passport workspace.</h1><p>Enter your organisation details, create the actual battery model and collect source documents. Publication follows evidence review and validation.</p></div><button className="button secondary" disabled={busy} onClick={checkOrganisation}>Refresh organisation</button></section>
    <DevAuthPanel />
    {error && <div className="alert" role="alert">{error}</div>}
    {notice && <div className="notice" role="status">{notice}</div>}
    <section className="panel"><span className="stepNo">01</span><h2>Organisation</h2>
      {organisation ? <div><strong>{organisation.legalName}</strong><p>Country: {organisation.countryCode} · Workspace role: {organisation.role}</p><p>Your saved organisation details are available. Official identity verification and Registry onboarding are separate steps.</p><Link className="button secondary" href="/registry-onboarding">Review Registry preparation</Link></div> : !checked ? <p>{busy ? 'Checking organisation…' : 'Sign in and refresh to check whether your organisation has already been created.'}</p> : <form onSubmit={bootstrap}>
        <label>Registered legal name<input value={orgName} onChange={e => setOrgName(e.target.value)} minLength={2} required autoComplete="organization" /></label>
        <label>Country code<input value={country} onChange={e => setCountry(e.target.value.toUpperCase())} minLength={2} maxLength={2} pattern="[A-Za-z]{2}" placeholder="NL" required /></label>
        <label>Workspace role<select value={role} onChange={e => setRole(e.target.value)} required><option value="">Select your role</option><option value="responsible_economic_operator">Responsible economic operator</option><option value="service_provider">Service provider</option></select></label>
        <label>VAT number, if applicable<input value={vatNumber} onChange={e => setVatNumber(e.target.value)} /></label>
        <button className="button" type="submit" disabled={busy || orgName.trim().length < 2 || country.trim().length !== 2 || !role}>{busy ? 'Creating workspace…' : 'Create organisation workspace'}</button>
        <p>Use the organisation represented by your authenticated account. A service provider needs a separate written authorisation before acting for another organisation.</p>
      </form>}
    </section>
    <div className="stepGrid">
      <section className="panel"><span className="stepNo">02</span><h2>Models and items</h2><p>Create a model using its actual identifier and category. Add individual batteries using their real serial or item identifiers.</p><Link className="button" href="/models">Manage battery models</Link></section>
      <section className="panel"><span className="stepNo">03</span><h2>Supplier evidence</h2><p>Ask for missing fields and source documents. Review supplier declarations before importing them as unvalidated values.</p><Link className="button" href="/suppliers">Request supplier data</Link></section>
      <section className="panel"><span className="stepNo">04</span><h2>Evidence and review</h2><p>Upload documents securely, check their integrity and review their relevance to each model and value.</p><Link className="button" href="/evidence">Manage evidence</Link></section>
      <section className="panel"><span className="stepNo">05</span><h2>Prepare and publish</h2><p>Inspect readiness blockers, validate source-backed values and publish a version only when the existing gates allow it.</p><Link className="button" href="/passports">Open passport workspace</Link></section>
    </div>
    <section className="panel"><h2>Publication and registration are separate</h2><p>Creating a workspace, model or item does not establish conformity. A published passport is not automatically EU registered. The official Registry connection remains unavailable until the verified integration is ready.</p></section>
  </AppShell>;
}
