'use client';
import { useEffect, useState } from 'react';

type Session = { configured: boolean; authenticated: boolean; name?: string };

export default function SessionPanel() {
  const [session, setSession] = useState<Session | null>(null);
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') return;
    // Discard credentials left by older development builds. Production never reads them.
    try { for (const key of ['eubp_token', 'eubp_acting_org', 'eubp_dev_org']) localStorage.removeItem(key); } catch { /* Storage may be disabled; cookie sessions still work. */ }
    let active = true;
    const expired = () => setSession({ configured: true, authenticated: false });
    window.addEventListener('eubp-session-expired', expired);
    fetch('/api/session', { credentials: 'same-origin', cache: 'no-store' })
      .then(response => response.json()).then(data => { if (active) setSession(data); })
      .catch(() => { if (active) setSession({ configured: false, authenticated: false }); });
    return () => { active = false; window.removeEventListener('eubp-session-expired', expired); };
  }, []);
  if (process.env.NODE_ENV === 'development') return null;
  if (!session) return <div className="notice single" role="status">Checking your session…</div>;
  if (!session.configured) return <div className="notice single" role="status">Secure sign-in is being set up. Please contact your administrator.</div>;
  return <div className="notice"><div><strong>{session.authenticated ? (session.name ? `Signed in as ${session.name}` : 'Signed in') : 'Sign in to your workspace'}</strong><div className="tiny">{session.authenticated ? 'Your organisation determines which information you can access.' : 'Use your company account to access your battery passports.'}</div></div>{session.authenticated
    ? <form method="post" action="/auth/logout"><button className="button secondary" type="submit">Sign out</button></form>
    : <a className="button" href="/auth/login">Sign in</a>}</div>;
}
