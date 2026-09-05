'use client';
import {useEffect,useState} from 'react';
import Link from 'next/link';
import AppShell from '../../components/AppShell';
import DevAuthPanel from '../../components/DevAuthPanel';
import {API_URL,apiFetch} from '../../lib/api';

export default function Registry(){
 const[health,setHealth]=useState<any>();const[orgReadiness,setOrgReadiness]=useState<any>();
 useEffect(()=>{fetch(`${API_URL}/health`).then(r=>r.json()).then(setHealth);apiFetch('/organisations/registry-profile/readiness').then(setOrgReadiness).catch(()=>{})},[]);
 return <AppShell><section className="pageHead"><div><div className="kicker">EU DPP REGISTRY</div><h1>Registration requires three independent gates.</h1><p>A compliant passport, a currently verified responsible economic operator and — when we act for the customer — our own currently verified value-chain-actor identity plus written authorisation.</p></div></section><DevAuthPanel/>
 <div className="metrics"><div className="metricCard warn"><span>Battery submission</span><strong>{health?.registryBatterySubmissionAvailable?'ENABLED':'LOCKED'}</strong><small>Battery semantic catalogue / live adapter gate</small></div><div className="metricCard"><span>Economic operator</span><strong>{orgReadiness?.registryIdentity?.status?.toUpperCase?.()||'UNVERIFIED'}</strong><small>EU Registry verification is external and time-limited</small></div><div className="metricCard"><span>Batch safety</span><strong>100</strong><small>Maximum records per current file submission</small></div><div className="metricCard"><span>Identifier gate</span><strong>HTTPS</strong><small>Preparation rejects non-HTTPS UPI</small></div></div>
 <section className="panel"><div className="panelTop"><div><h2>Registry truth model</h2><p>No marketing label can bypass these states.</p></div><Link className="button" href="/registry-onboarding">Prepare organisation verification</Link></div><div className="pipeline"><span>Passport compliance</span><i>→</i><span>EO verification</span><i>→</i><span>Provider verification + authorisation</span><i>→</i><span>Registry semantic validation</span><i>→</i><span>Correlation/result</span><i>→</i><span>REGISTERED only on success</span></div></section>
 <section className="panel"><h2>Current deliberate lock</h2><p>As long as the Commission battery semantic catalogue is unavailable or the official adapter is not validated, the platform can prepare/export and prevalidate but cannot create a false registered state.</p></section></AppShell>
}
