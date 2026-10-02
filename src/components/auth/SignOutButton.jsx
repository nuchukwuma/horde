'use client';

import { useState } from 'react';

/**
 * Sign out, for sellers (platform session) and store customers (storefront
 * session). The endpoint revokes the session server-side and clears the
 * cookie; only then does the page move, so a failed request never leaves
 * someone believing they are signed out when they are not.
 */
export default function SignOutButton({ endpoint, redirectTo = '/', className = 'btn btn--sm btn--quiet', children = 'Sign out' }) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function signOut() {
    setBusy(true);
    setFailed(false);
    try {
      const response = await fetch(endpoint, { method: 'POST' });
      if (!response.ok) throw new Error('sign-out failed');
      window.location.assign(redirectTo);
    } catch {
      setFailed(true);
      setBusy(false);
    }
  }

  return (
    <button type="button" className={className} onClick={signOut} disabled={busy} title={failed ? 'Could not sign out. Try again.' : undefined}>
      {busy ? 'Signing out…' : failed ? 'Try again' : children}
    </button>
  );
}
