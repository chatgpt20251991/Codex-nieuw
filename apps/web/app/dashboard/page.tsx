'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import AppShell from '../../components/AppShell';
import DevAuthPanel from '../../components/DevAuthPanel';
import MetricCard from '../../components/MetricCard';
import { useWorkspace, useWorkspaceApi } from '../../components/WorkspaceProvider';

export default function Dashboard() {
  const apiFetch = useWorkspaceApi(), { view, customer } = useWorkspace();
  const [models, setModels] = useState<any[]>([]), [suppliers, setSuppliers] = useState<any[]>([]), [error, setError] = useState('');
  const canReadModels = view.actingId === null || Boolean(customer?.availableActions.includes('modelRead'));
  const canReadSuppliers = view.actingId === null || Boolean(customer?.availableActions.includes('supplierRead'));
  async function load() {
    setModels([]); setSuppliers([]); setError('');
    try {
      const [nextModels, nextSuppliers] = await Promise.all([
        canReadModels ? apiFetch<any[]>('/battery-models') : Promise.resolve([]),
        canReadSuppliers ? apiFetch<any[]>('/suppliers') : Promise.resolve([]),
      ]);
      if (!apiFetch.isCurrent()) return;
      setModels(nextModels); setSuppliers(nextSuppliers);
    } catch { if (apiFetch.isCurrent()) setError('The permitted workspace information could not be loaded. Refresh or check your access.'); }
  }
  useEffect(() => { load(); }, []);
  const items = models.reduce((count, model) => count + (model._count?.items || 0), 0);
  return <AppShell><section className="pageHead"><div><div className="kicker">CONTROL TOWER</div><h1>Battery passport operations, one truth layer.</h1><p>Supplier evidence, validation, immutable passport versions, controlled access and Registry preparation in one workspace.</p></div><button className="button" onClick={load}>Refresh</button></section>
    <DevAuthPanel />{error && <div className="alert" role="alert">{error}</div>}
    <div className="metrics"><MetricCard label="Battery models" value={canReadModels ? models.length : 'Not granted'} /><MetricCard label="Battery items" value={canReadModels ? items : 'Not granted'} />
      <MetricCard label="Suppliers" value={canReadSuppliers ? suppliers.length : 'Not granted'} /><MetricCard label="Registry" value="GATED" detail="Semantic/API readiness flag remains conservative" tone="warn" /></div>
    <section className="panel"><div className="panelHead"><div><span className="kicker">PORTFOLIO</span><h2>Models requiring attention</h2></div></div>
      {canReadModels && <div className="workflowActions"><Link className="button secondary" href="/models">Open battery models</Link></div>}
      {!canReadModels ? <p>Model reading is not included in this authorisation. Choose an available action or ask the responsible operator to review the written agreement.</p> : models.length ? <div className="rows">{models.map(model => <div className="row" key={model.id}><div><strong>{model.name || model.modelIdentifier}</strong><span>{model.modelIdentifier} · {model.category}</span></div><div className="rowMeta"><span>{model._count?.items || 0} items</span><span className="badge neutral">{model.lifecycleStatus}</span></div></div>)}</div> : <div className="empty">No battery models found in this workspace.</div>}
    </section>
  </AppShell>;
}
