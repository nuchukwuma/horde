'use client';

import { useEffect, useState } from 'react';

/**
 * Reads the token from the address and POSTs it. The link is a GET to the
 * page, and the page does the POST, so a mail scanner opening the link cannot
 * spend the token (see /api/shop/account/verify-email).
 */
export default function ConfirmCustomerEmail({ storeName }) {
  const [state, setState] = useState({ status: 'working', email: null });

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get('token');
    if (!token) {
      setState({ status: 'error' });
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch('/api/shop/account/verify-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        });
        const body = await response.json().catch(() => null);
        if (cancelled) return;
        setState(response.ok ? { status: 'done', email: body?.data?.email } : { status: 'error' });
      } catch {
        if (!cancelled) setState({ status: 'offline' });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="container container--narrow" style={{ maxWidth: 460, paddingBlock: '56px 64px' }}>
      <div role="status">
        {state.status === 'working' ? (
          <>
            <h1 style={{ fontSize: 26, marginBottom: 8 }}>Confirming your email…</h1>
            <p style={{ color: 'var(--text-secondary)', margin: 0 }}>One moment.</p>
          </>
        ) : state.status === 'done' ? (
          <>
            <h1 style={{ fontSize: 26, marginBottom: 8 }}>Email confirmed</h1>
            <p style={{ color: 'var(--text-secondary)', marginTop: 0 }}>
              Thanks — {state.email ?? 'your address'} is confirmed. Receipts and replies from {storeName} will reach
              you there.
            </p>
            <a className="btn btn--primary" href="/shop">
              Back to the shop
            </a>
          </>
        ) : (
          <>
            <h1 style={{ fontSize: 26, marginBottom: 8 }}>That link didn’t work</h1>
            <p style={{ color: 'var(--text-secondary)', marginTop: 0 }}>
              {state.status === 'offline'
                ? 'Could not reach the store. Check your connection and open the link again.'
                : 'Links expire after 24 hours and work once. Sign in and ask for a new one from your messages page.'}
            </p>
            <a className="btn btn--primary" href="/account/messages">
              Sign in
            </a>
          </>
        )}
      </div>
    </div>
  );
}
