'use client';
import { useEffect, useState } from 'react';

type Session = { configured: boolean; authenticated: boolean; name?: string };

export default function SessionPanel() {
  const [session, setSession] = useState<Session | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  const [logoutError, setLogoutError] = useState('');
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
  async function logout() {
    setSigningOut(true); setLogoutError('');
    try {
      // A navigation form under no-referrer sends Origin:null. An explicit
      // CORS-mode fetch preserves Origin for the CSRF check without a Referer.
      const response = await fetch('/auth/logout', { method: 'POST', mode: 'cors',
        headers: { accept: 'application/json' }, credentials: 'same-origin',
        referrerPolicy: 'no-referrer', cache: 'no-store', redirect: 'error' });
      if (!response.ok) throw new Error('Logout unavailable');
      const data = await response.json();
      const destination = new URL(data.redirectTo);
      if (destination.protocol !== 'https:' || destination.username || destination.password || destination.hash) throw new Error('Invalid logout destination');
      // The server restricts this URL to the configured provider and registered return URL.
      window.location.assign(destination.href);
    } catch {
      setLogoutError('Sign-out could not be completed. Please try again.');
      setSigningOut(false);
    }
  }
  if (process.env.NODE_ENV === 'development') return null;
  if (!session) return <div className="notice single" role="status">Checking your session…</div>;
  if (!session.configured) return <div className="notice single" role="status">Secure sign-in is being set up. Please contact your administrator.</div>;
  return <div className="notice"><div><strong>{session.authenticated ? (session.name ? `Signed in as ${session.name}` : 'Signed in') : 'Sign in to your workspace'}</strong><div className="tiny">{session.authenticated ? 'Your organisation determines which information you can access.' : 'Use your company account to access your battery passports.'}</div>{logoutError && <div role="alert">{logoutError}</div>}</div>{session.authenticated
    ? <button className="button secondary" type="button" disabled={signingOut} onClick={logout}>Sign out</button>
    : <a className="button" href="/auth/login">Sign in</a>}</div>;
}
