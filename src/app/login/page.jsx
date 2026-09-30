'use client';

import { useState } from 'react';

/**
 * Sign in.
 *
 * Plain and small on purpose: a login form is a place people want to leave
 * quickly, and anything decorative here is in the way.
 */

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const body = await response.json();

      if (!response.ok) {
        setError(body?.error?.message ?? 'Could not sign in');
        return;
      }

      window.location.href = body.data.redirectTo;
    } catch {
      setError('Could not reach the server. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="shell">
      <header className="masthead">
        <div className="container masthead__inner">
          <a className="brand" href="/">
            HordeMart
          </a>
        </div>
      </header>

      <main className="container" style={{ maxWidth: 420, paddingBlock: '64px' }}>
        <h1 style={{ fontSize: 26, marginBottom: 6 }}>Sign in</h1>
        <p style={{ color: 'var(--text-secondary)', marginTop: 0, marginBottom: 28 }}>
          Manage your store, portfolio and journal.
        </p>

        <form onSubmit={onSubmit} className="stack" style={{ '--stack-gap': '16px' }}>
          {/* Errors are announced, not just coloured. */}
          {error ? (
            <div className="card" role="alert" style={{ borderColor: 'var(--critical)' }}>
              {error}
            </div>
          ) : null}

          <div>
            <label htmlFor="email" style={labelStyle}>
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              style={inputStyle}
            />
          </div>

          <div>
            <label htmlFor="password" style={labelStyle}>
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              style={inputStyle}
            />
          </div>

          <button className="btn btn--primary" type="submit" disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </main>
    </div>
  );
}

const labelStyle = {
  display: 'block',
  fontSize: 13,
  fontWeight: 600,
  marginBottom: 6,
};

const inputStyle = {
  width: '100%',
  font: 'inherit',
  fontSize: 15,
  padding: '10px 12px',
  borderRadius: 'var(--radius-sm)',
  border: '1px solid var(--border-strong)',
  background: 'var(--surface-1)',
  color: 'var(--text-primary)',
  minHeight: 42,
};
