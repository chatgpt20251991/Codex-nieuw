'use client';
import { createContext, Fragment, type ReactNode, useContext, useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { ApiResponseError, createApiFetch } from '../lib/api';
import { createWorkspaceContext, currentCustomer, customerFingerprint, isOperatorPath, isOwnWorkspacePath,
  parseCustomerWorkspaces, parseWorkspaceOrganisation, type CustomerWorkspace, type WorkspaceApi,
  type WorkspaceOrganisation, type WorkspaceSnapshot } from '../lib/workspace';
import WorkspaceSelector from './WorkspaceSelector';
import DevAuthPanel from './DevAuthPanel';
import { requestSignOut } from './SessionPanel';

type Phase = 'loading' | 'ready' | 'switching' | 'blocked' | 'signed_out' | 'error';
type View = { phase: Phase; epoch: number; own: WorkspaceOrganisation | null; identityChecked: boolean;
  customers: CustomerWorkspace[]; actingId: string | null; api?: WorkspaceApi; error: string; notice: string };
const initial: View = { phase: 'loading', epoch: 0, own: null, identityChecked: false, customers: [], actingId: null, error: '', notice: '' };
type Workspace = { view: View; customer?: CustomerWorkspace; ownOnly: boolean; change: (id: string | null) => void; refresh: () => void };
const Context = createContext<Workspace | null>(null);

export function useWorkspace() {
  const workspace = useContext(Context);
  if (!workspace) throw new Error('A workspace provider is required.');
  return workspace;
}
export function useWorkspaceApi(): WorkspaceApi {
  const { view, ownOnly } = useWorkspace();
  if (view.phase !== 'ready' || !view.api || (ownOnly && view.actingId !== null)) throw new Error('The workspace is not ready.');
  return view.api;
}

export default function WorkspaceProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname(), router = useRouter();
  const operator = isOperatorPath(pathname), ownOnly = isOwnWorkspacePath(pathname);
  const [view, setView] = useState<View>(initial);
  const [signOut, setSignOut] = useState<'pending' | 'failed' | ''>('');
  const state = useRef(view), context = useRef(createWorkspaceContext()), sequence = useRef(0);
  const currentScope = useRef<WorkspaceSnapshot | undefined>(undefined);
  const discovery = useRef<AbortController | undefined>(undefined);
  const mounted = useRef(false), activePath = useRef(pathname), signOutStatus = useRef(signOut);
  const identity = useRef<string | null>(null), identityCheck = useRef<Promise<void> | undefined>(undefined);
  signOutStatus.current = signOut;
  state.current = view; activePath.current = pathname;
  function commit(next: View) { state.current = next; setView(next); }
  function cancel() { sequence.current++; discovery.current?.abort(); discovery.current = undefined; }
  function stop(phase: Phase, error: string) {
    cancel(); context.current.invalidate(); currentScope.current = undefined;
    const previous = state.current;
    if (phase === 'signed_out') identity.current = null;
    commit({ ...previous, phase, api: undefined, customers: [], epoch: previous.epoch + 1, error, notice: '',
      ...(phase === 'signed_out' ? { own: null, identityChecked: false, actingId: null } : {}) });
  }
  function activate(target: string | null, own: WorkspaceOrganisation | null, customers: CustomerWorkspace[], clean: boolean, notice = '', warning = '') {
    const snapshot = context.current.activate(target, customers); currentScope.current = snapshot;
    const api = createApiFetch(snapshot, error => {
      if (!snapshot.isCurrent() || (target === null && error.code !== 'AUTH_CONTEXT_CHANGED')) return;
      if (error.code === 'AUTH_CONTEXT_CHANGED') stop('blocked', 'Your signed-in identity changed. The request was not retried. Refresh access and inspect any earlier actions before continuing.');
      else backgroundCheck();
    }, async () => { await identityCheck.current; }, identity.current || undefined);
    commit({ phase: clean ? 'switching' : 'ready', epoch: snapshot.epoch, own, identityChecked: true,
      customers, actingId: target, api, error: warning, notice });
    if (clean) router.replace('/dashboard', { scroll: true });
  }
  async function loadAccess(passive = false) {
    if (!mounted.current || !isOperatorPath(activePath.current) || signOutStatus.current === 'pending') return;
    if (passive && discovery.current) return;
    cancel(); const ticket = sequence.current, previous = state.current;
    const abort = new AbortController(); discovery.current = abort;
    let ownScope: WorkspaceSnapshot;
    if (passive) {
      // Discovery is an own-organisation request, separate from the active view.
      const local = createWorkspaceContext(); ownScope = local.activate(null);
      abort.signal.addEventListener('abort', () => local.invalidate(), { once: true });
    } else {
      context.current.invalidate(); ownScope = context.current.activate(null); currentScope.current = undefined;
      commit({ ...previous, phase: 'loading', api: undefined, customers: [], error: '', notice: '', epoch: ownScope.epoch });
    }
    const current = () => mounted.current && sequence.current === ticket && !abort.signal.aborted && isOperatorPath(activePath.current);
    try {
      let accountChanged = false;
      if (process.env.NODE_ENV !== 'development') {
        const sessionResponse = await fetch('/api/session', { credentials: 'same-origin', cache: 'no-store', redirect: 'error', signal: abort.signal });
        const session = await sessionResponse.json();
        if (!current()) return;
        if (!sessionResponse.ok || session?.configured !== true || session?.authenticated !== true
          || typeof session.identityContext !== 'string' || !/^[a-f0-9]{64}$/.test(session.identityContext)) {
          throw new ApiResponseError(sessionResponse.status >= 500 ? 503 : 401, '', 'Your session could not be verified.');
        }
        accountChanged = identity.current !== null && identity.current !== session.identityContext;
        identity.current = session.identityContext;
        if (accountChanged) {
          if (passive) context.current.invalidate();
          currentScope.current = undefined;
          commit({ ...state.current, phase: 'blocked', api: undefined, identityChecked: false, own: null, customers: [], actingId: null,
            epoch: state.current.epoch + 1, error: 'Your signed-in identity or application role changed. Choose a workspace again.', notice: '' });
        }
      }
      const ownApi = createApiFetch(ownScope, undefined, undefined, identity.current || undefined);
      let own: WorkspaceOrganisation | null = null;
      try { own = parseWorkspaceOrganisation(await ownApi('/organisations/current', { signal: abort.signal })); }
      catch (cause) { if (!(cause instanceof ApiResponseError && cause.status === 404)) throw cause; }
      if (!current()) return;
      let customers: CustomerWorkspace[] = [], warning = '';
      try { customers = parseCustomerWorkspaces(await ownApi('/organisations/authorised-customers', { signal: abort.signal }), own?.id || null); }
      catch (cause) {
        if (cause instanceof ApiResponseError && (cause.status === 401 || cause.code === 'AUTH_CONTEXT_CHANGED')) throw cause;
        warning = 'Authorised customers could not be checked. Customer workspaces remain unavailable until a successful refresh.';
      }
      if (!current()) return;
      const now = state.current, oldCustomer = previous.customers.find(row => row.id === previous.actingId);
      if (accountChanged) {
        context.current.invalidate(); currentScope.current = undefined;
        commit({ ...now, phase: 'blocked', api: undefined, own, identityChecked: true, customers, actingId: null,
          error: 'Your signed-in identity or application role changed. Choose a workspace again.', notice: '' }); return;
      }
      const wanted = isOwnWorkspacePath(activePath.current) ? null : previous.actingId;
      const selected = wanted === null ? undefined : customers.find(row => row.id === wanted);
      if (passive) {
        const identityChanged = Boolean(previous.own && previous.own.id !== own?.id);
        if (identityChanged || (wanted !== null && (warning || !selected))) {
          context.current.invalidate(); currentScope.current = undefined;
          commit({ ...now, phase: 'blocked', api: undefined, own, identityChecked: true, customers,
            epoch: now.epoch + 1, error: identityChanged ? 'Your organisation changed. Choose a workspace again before continuing.'
              : 'Customer authorisation changed or could not be confirmed. Choose a workspace or refresh access before continuing.', notice: '' });
        } else if (wanted !== null && customerFingerprint(selected) !== customerFingerprint(oldCustomer)) {
          activate(wanted, own, customers, true, 'Customer authorisation updated. Review the current permissions before continuing. No previous action has been repeated.');
        } else if (now.phase === 'loading' && wanted !== null && selected) {
          activate(wanted, own, customers, true, 'Customer access refreshed. No previous action has been repeated.');
        } else commit({ ...now, own, customers, error: warning });
        return;
      }
      if (wanted !== null && (!selected || warning)) {
        context.current.invalidate(); currentScope.current = undefined;
        commit({ ...state.current, phase: 'blocked', own, identityChecked: true, customers, api: undefined,
          error: warning || 'This customer no longer has a current authorisation. Choose a workspace before continuing.', notice: '' });
        return;
      }
      // A refresh after denied access may restore a view, never replay its action.
      activate(wanted, own, customers, previous.phase === 'blocked' || previous.actingId !== wanted,
        previous.phase === 'blocked' ? 'Access refreshed. No previous action has been repeated.' : '', warning);
    } catch (cause) {
      if (!current()) return;
      stop(cause instanceof ApiResponseError && cause.status === 401 ? 'signed_out' : 'error',
        cause instanceof ApiResponseError && cause.status === 401 ? 'Sign in to load your organisation workspace.' : 'Your workspace could not be verified. Sign in or refresh before continuing.');
    } finally { if (sequence.current === ticket) { discovery.current = undefined; abort.abort(); } }
  }
  function backgroundCheck() {
    if (identityCheck.current) return;
    const checking = loadAccess(true); identityCheck.current = checking;
    void checking.finally(() => { if (identityCheck.current === checking) identityCheck.current = undefined; });
  }
  function change(id: string | null) {
    const previous = state.current;
    if (!previous.identityChecked || ['loading', 'switching', 'signed_out'].includes(previous.phase)
      || (isOwnWorkspacePath(activePath.current) && id !== null)) return;
    cancel();
    try {
      activate(id, previous.own, previous.customers, true, id === null ? 'Your own organisation workspace is selected.' : 'Customer workspace selected. The API checks each action against its current authorisation.');
    } catch { stop('blocked', 'This customer is not currently available. Refresh access and choose a listed workspace.'); }
  }
  useEffect(() => {
    mounted.current = true;
    const expired = () => stop('signed_out', 'Your session ended. Sign in again before accessing organisation data.');
    const changed = () => { stop('blocked', 'Your session changed. Refresh your workspace before continuing.'); void loadAccess(); };
    const signingOut = (event: Event) => {
      const status = (event as CustomEvent).detail;
      if (status !== 'pending' && status !== 'failed') return;
      signOutStatus.current = status; setSignOut(status);
      stop('signed_out', status === 'pending' ? 'Signing out. Your private workspace view has been cleared.'
        : 'Sign-out could not be confirmed. Your private view remains cleared. Retry sign-out or sign in again.');
    };
    const storage = (event: StorageEvent) => { if (process.env.NODE_ENV === 'development' && (!event.key || event.key === 'eubp_token')) changed(); };
    window.addEventListener('eubp-session-expired', expired); window.addEventListener('eubp-signout-state', signingOut); window.addEventListener('storage', storage);
    if (process.env.NODE_ENV === 'development') window.addEventListener('eubp-development-session-changed', changed);
    return () => { mounted.current = false; cancel(); context.current.invalidate(); window.removeEventListener('eubp-session-expired', expired); window.removeEventListener('eubp-signout-state', signingOut); if (process.env.NODE_ENV === 'development') window.removeEventListener('eubp-development-session-changed', changed); window.removeEventListener('storage', storage); };
  }, []);
  useEffect(() => {
    if (!operator) {
      cancel(); context.current.invalidate(); currentScope.current = undefined; commit({ ...initial, epoch: state.current.epoch + 1 }); return;
    }
    if (ownOnly && state.current.actingId !== null && state.current.identityChecked) {
      cancel(); activate(null, state.current.own, state.current.customers, false, 'Authorisation management and onboarding use your own organisation.'); return;
    }
    if (state.current.phase === 'loading' && !discovery.current) void loadAccess();
  }, [operator, ownOnly]);
  useEffect(() => {
    if (view.phase !== 'switching') return;
    const selectedEpoch = view.epoch, deadline = Date.now() + 10000;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const complete = () => {
      if (!mounted.current || state.current.phase !== 'switching' || state.current.epoch !== selectedEpoch) return;
      if (activePath.current === '/dashboard' && window.location.pathname === '/dashboard'
        && window.location.search === '' && window.location.hash === '') commit({ ...state.current, phase: 'ready' });
      else if (Date.now() >= deadline) stop('blocked', 'Workspace navigation could not be completed. Choose a workspace again.');
      else timer = setTimeout(complete, 30);
    };
    complete(); return () => clearTimeout(timer);
  }, [pathname, view.phase, view.epoch]);
  useEffect(() => {
    if (!operator || view.phase !== 'ready') return;
    const focus = () => { if (document.visibilityState === 'visible') backgroundCheck(); };
    const customer = view.customers.find(row => row.id === view.actingId);
    const expiry = customer?.nextExpiry ? Math.max(0, Date.parse(customer.nextExpiry) - Date.now()) : 30000;
    const timer = window.setTimeout(() => {
      if (view.actingId && (!currentScope.current?.isCurrent())) {
        commit({ ...state.current, phase: 'loading', api: undefined, epoch: state.current.epoch + 1,
          notice: '', error: 'Checking the remaining current authorisations. No previous action is being repeated.' });
        backgroundCheck();
      } else backgroundCheck();
    }, Math.min(expiry, 30000));
    window.addEventListener('focus', focus); window.addEventListener('pageshow', focus); document.addEventListener('visibilitychange', focus);
    return () => { window.clearTimeout(timer); window.removeEventListener('focus', focus); window.removeEventListener('pageshow', focus); document.removeEventListener('visibilitychange', focus); };
  }, [operator, view.epoch, view.phase, view.customers]);

  const customer = view.customers.find(row => row.id === view.actingId);
  const value: Workspace = { view, customer: customer && currentCustomer(customer), ownOnly, change, refresh: () => { void loadAccess(); } };
  const ready = view.phase === 'ready' && (!ownOnly || view.actingId === null);
  return <Context.Provider value={value}>{!operator ? children : ready ? <Fragment key={view.epoch}>{children}</Fragment>
    : <main className="workspaceGate"><div className="kicker">ORGANISATION WORKSPACE</div><h1>{view.phase === 'signed_out' ? 'Sign in to your workspace.' : view.phase === 'switching' || view.phase === 'loading' ? 'Checking your workspace…' : 'Workspace access is paused.'}</h1>
      {view.error && <p role="alert">{view.error}</p>}
      <WorkspaceSelector />
      {process.env.NODE_ENV === 'development' && <DevAuthPanel />}
      <div className="workflowActions"><a className="button" href="/auth/login">Sign in</a><button type="button" className="button secondary" disabled={view.phase === 'loading' || view.phase === 'switching' || signOut === 'pending'} onClick={() => { signOutStatus.current = ''; setSignOut(''); void loadAccess(); }}>Retry workspace check</button>
        {signOut === 'failed' && <button type="button" className="button secondary" onClick={() => { void requestSignOut().catch(() => {}); }}>Retry sign-out</button>}</div>
      <p>Only the current organisation view is opened. Switching workspaces clears open forms; already submitted actions may still complete in their original organisation.</p>
    </main>}</Context.Provider>;
}
