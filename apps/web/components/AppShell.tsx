'use client';
import SessionPanel from './SessionPanel';import Link from 'next/link';import {usePathname} from 'next/navigation';import {ReactNode} from 'react';
import WorkspaceSelector from './WorkspaceSelector';
import { useWorkspace } from './WorkspaceProvider';
import { workspaceNavigation } from '../lib/workspace';
const nav=[['/dashboard','Overview'],['/models','Battery models'],['/passports','Passport dossiers'],['/suppliers','Suppliers'],['/evidence','Evidence'],['/authorisations','Authorisations'],['/registry','EU Registry'],['/registry-onboarding','Registry setup'],['/onboarding','Onboarding']];
export default function AppShell({children}:{children:ReactNode}) {
  const path = usePathname(), { view, customer } = useWorkspace();
  const available = nav.filter(([href]) => workspaceNavigation(href, view.actingId !== null, customer?.availableActions || []));
  return <div className="app"><aside className="sidebar"><Link className="logo" href="/dashboard"><div className="logoMark">EU</div><div><strong>Battery Passport</strong><span>Compliance OS</span></div></Link><nav>{available.map(([href,label])=><Link key={href} className={path.startsWith(href)?'nav active':'nav'} href={href}>{label}</Link>)}</nav><div className="sideFoot"><span className="dot amber"/>EU battery Registry adapter gated<div className="tiny">No false “registered” state while the integration gate is closed.</div></div></aside><main className="main"><header className="appbar"><div><span className="eyebrow">{view.actingId ? `ACTING FOR ${customer?.legalName || 'CUSTOMER WORKSPACE'}` : 'YOUR ORGANISATION WORKSPACE'}</span></div><div className="status"><span className="dot green"/>Rule set EU-BR-2026.08</div></header><SessionPanel/><WorkspaceSelector/>{children}</main></div>;
}
