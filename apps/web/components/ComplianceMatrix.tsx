'use client';
import { useEffect, useMemo, useState } from 'react';
import { useWorkspace, useWorkspaceApi } from './WorkspaceProvider';
type Field = { id: number; name: string; legal_source: string; access_tier: string; currentRequirement: string; note?: string };
export default function ComplianceMatrix() {
  const apiFetch = useWorkspaceApi(), { view, customer } = useWorkspace();
  const allowed = view.actingId === null || Boolean(customer?.availableActions.includes('complianceRead'));
  const [category, setCategory] = useState('EV'), [fields, setFields] = useState<Field[]>([]), [query, setQuery] = useState('');
  const [error, setError] = useState(''), [loaded, setLoaded] = useState(false);
  useEffect(() => {
    let active = true; setFields([]); setError(''); setLoaded(false);
    if (allowed) apiFetch<Field[]>(`/compliance/fields?category=${category}`).then(rows => {
      if (active && apiFetch.isCurrent()) { setFields(rows); setLoaded(true); }
    }).catch(() => { if (active && apiFetch.isCurrent()) setError('The regulatory matrix could not be loaded.'); });
    return () => { active = false; };
  }, [category, allowed, apiFetch]);
  const metrics = useMemo(() => ({ required: fields.filter(field => ['mandatory', 'mandatory_dynamic'].includes(field.currentRequirement)).length,
    deferred: fields.filter(field => ['deferred_format_pending', 'deferred_until_august_2027', 'deferred_article_8'].includes(field.currentRequirement)).length,
    restricted: fields.filter(field => field.access_tier !== 'public').length }), [fields]);
  if (!allowed) return <section className="panel"><h2>Regulatory matrix</h2><p>Reading the regulatory definitions is not included in this authorisation.</p></section>;
  const filtered = fields.filter(field => `${field.name} ${field.legal_source} ${field.currentRequirement}`.toLowerCase().includes(query.toLowerCase()));
  return <section className="panel"><div className="panelHead"><div><span className="kicker">REGULATORY MATRIX</span><h2>71 data points</h2><p>Requirements are maintained in the reviewed rule configuration.</p></div><div className="filters">
    <input placeholder="Search data points" value={query} onChange={event => setQuery(event.target.value)} /><select aria-label="Matrix battery category" value={category} onChange={event => setCategory(event.target.value)}><option value="EV">EV</option><option value="LMT">LMT</option><option value="INDUSTRIAL_GT_2KWH">Industrial &gt;2 kWh</option></select></div></div>
    {error && <div className="alert" role="alert">{error}</div>}
    {!loaded ? <p>{error ? 'No result is displayed until the definitions have been loaded.' : 'Loading definitions…'}</p> : <><div className="miniMetrics"><span><b>{metrics.required}</b> base mandatory</span><span><b>{metrics.deferred}</b> deferred</span><span><b>{metrics.restricted}</b> restricted-access points</span></div>
      <div className="tableWrap"><table><thead><tr><th>#</th><th>Data point</th><th>Requirement</th><th>Access</th></tr></thead><tbody>{filtered.map(field => <tr key={field.id}><td>{field.id}</td><td><strong>{field.name}</strong><small>{field.legal_source}</small></td><td><span className="badge neutral">{field.currentRequirement}</span></td><td>{field.access_tier}</td></tr>)}</tbody></table></div></>}
  </section>;
}
