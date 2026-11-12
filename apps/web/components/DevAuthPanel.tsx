'use client';
import { useEffect, useState } from 'react';
import { API_URL } from '../lib/api';

export default function DevAuthPanel() { return process.env.NODE_ENV === 'development' ? <DevelopmentSession /> : null; }
function DevelopmentSession() {
  const [organisationId, setOrganisationId] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  useEffect(() => { setOrganisationId(crypto.randomUUID()); }, []);
  async function login() {
    if (busy || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(organisationId)) return;
    setBusy(true); setError('');
    try {
      const response = await fetch(`${API_URL}/auth/dev-token`, { method: 'POST', credentials: 'omit', cache: 'no-store', redirect: 'error',
        headers: { 'content-type': 'application/json' }, body: JSON.stringify({ subject: 'local-owner', organisationId,
          role: 'operator_admin', email: 'owner@local.test' }) });
      const result = await response.json();
      if (!response.ok || typeof result.accessToken !== 'string' || !result.accessToken || result.accessToken.length > 16384) throw new Error('Development session unavailable');
      // Only the existing isolated development credential is stored. Workspace
      // selection and identity metadata are never persisted by this control.
      localStorage.setItem('eubp_token', result.accessToken);
      window.dispatchEvent(new Event('eubp-development-session-changed'));
    } catch { setError('The development session could not be created.'); }
    finally { setBusy(false); }
  }
  return <section className="panel"><h2>Local development authentication</h2><p>Production refuses development tokens and requires the configured identity provider.</p>
    <label>Development organisation ID<input value={organisationId} disabled={busy} onChange={event => setOrganisationId(event.target.value)} /></label>
    <button type="button" className="button secondary" disabled={busy || !organisationId} onClick={login}>Create dev session</button>
    {error && <p role="alert">{error}</p>}</section>;
}
