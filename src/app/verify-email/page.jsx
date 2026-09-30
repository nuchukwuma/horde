'use client';

import { useEffect, useState } from 'react';

/**
 * The page an emailed verification link lands on.
 *
 * The link is a GET to this page, which then POSTs the token. It is done this
 * way round because mail clients, corporate link scanners and chat previews
 * follow GET links automatically — a token consumed by a GET would be spent
 * before the person ever clicked, and they would be told their own link was
 * invalid.
 */

export default function VerifyEmailPage() {
  const [state, setState] = useState({ status: 'working', message: null });

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get('token');

    if (!token) {
      setState({ status: 'error', message: 'This link is missing its token.' });
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const response = await fetch('/api/auth/verify-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        });
        const body = await response.json();
        if (cancelled) return;

        setState(
          response.ok
            ? { status: 'done', message: body.data.email }
            : { status: 'error', message: body?.error?.message ?? 'That link is not valid.' },
        );
      } catch {
        if (!cancelled) {
          setState({ status: 'error', message: 'Could not reach the server.' });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="shell">
      <header className="masthead">
        <div className="container masthead__inner">
          <a className="brand" href="/">
            HordeMart
          </a>
        </div>
      </header>

      <main className="container" style={{ maxWidth: 460, paddingBlock: '64px' }}>
        {/* role="status" so the outcome is announced, not only shown. */}
        <div role="status">
          {state.status === 'working' ? (
            <>
              <h1 style={{ fontSize: 24, marginBottom: 8 }}>Confirming your email…</h1>
              <p style={{ color: 'var(--text-secondary)', margin: 0 }}>One moment.</p>
            </>
          ) : null}

          {state.status === 'done' ? (
            <>
              <h1 style={{ fontSize: 24, marginBottom: 8 }}>Email confirmed</h1>
              <p style={{ color: 'var(--text-secondary)', marginTop: 0 }}>
                {state.message} is confirmed. You can now connect a bank account and start
                taking payments.
              </p>
              <a className="btn btn--primary" href="/login">
                Go to your dashboard
              </a>
            </>
          ) : null}

          {state.status === 'error' ? (
            <>
              <h1 style={{ fontSize: 24, marginBottom: 8 }}>That link didn&rsquo;t work</h1>
              <p style={{ color: 'var(--text-secondary)', marginTop: 0 }}>{state.message}</p>
              <p style={{ color: 'var(--text-secondary)' }}>
                Links expire after 24 hours and can only be used once. Sign in and request a
                new one from your dashboard.
              </p>
              <a className="btn btn--primary" href="/login">
                Sign in
              </a>
            </>
          ) : null}
        </div>
      </main>
    </div>
  );
}
