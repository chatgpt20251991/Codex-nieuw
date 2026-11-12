'use client';
import { useEffect, useState } from 'react';
import { useWorkspace } from './WorkspaceProvider';

export default function WorkspaceSelector() {
  const { view, customer, ownOnly, change, refresh } = useWorkspace();
  const [proposed, setProposed] = useState('');
  useEffect(() => { setProposed(view.customers.some(row => row.id === view.actingId) ? view.actingId || '' : ''); }, [view.actingId, view.customers]);
  const waiting = ['loading', 'switching', 'signed_out'].includes(view.phase) || !view.identityChecked;
  return <section className="workspaceBar" aria-label="Active workspace">
    <div className="workspaceCurrent"><span className="kicker">{view.actingId ? 'CUSTOMER WORKSPACE' : 'YOUR ORGANISATION'}</span>
      <strong>{view.actingId ? customer ? `Acting for ${customer.legalName}` : 'Customer access unavailable' : view.own?.legalName || 'Your organisation'}</strong>
      {view.phase === 'ready' && <span>{view.actingId ? 'Every action requires the current written authorisation.' : view.own ? 'Your own organisation is selected.' : 'Complete your organisation setup in Onboarding.'}</span>}
    </div>
    <div className="workspaceControls"><label>Workspace<select aria-label="Workspace" value={proposed} disabled={waiting || ownOnly} onChange={event => setProposed(event.target.value)}>
      <option value="">Your organisation{view.own ? ` · ${view.own.legalName}` : ''}</option>{view.customers.map(row => <option key={row.id} value={row.id}>{row.legalName} · {row.countryCode} · {row.id}</option>)}
    </select></label><div className="workflowActions"><button type="button" className="button" disabled={waiting || ownOnly || (view.phase === 'ready' && proposed === (view.actingId || ''))} onClick={() => change(proposed || null)}>Switch workspace</button>
      <button type="button" className="button secondary" disabled={waiting} onClick={refresh}>Refresh workspace access</button></div>
    </div>
    {ownOnly && <p className="workspaceHint">Onboarding and authorisation management use your own organisation. Open Overview to select a customer.</p>}
    {!ownOnly && <p className="workspaceHint">Switching clears open forms and returns to Overview. No previous action is repeated.</p>}
    {view.error && view.phase === 'ready' && <p className="workspaceHint" role="alert">{view.error}</p>}
    {view.notice && view.phase === 'ready' && <p className="workspaceHint" role="status">{view.notice}</p>}
  </section>;
}
