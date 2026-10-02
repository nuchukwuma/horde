'use client';

import { useState } from 'react';
import PlatformHeader from '@/components/platform/PlatformHeader';

/**
 * "Forgot your password?" Asks for the email and always gives the same
 * answer, so the page cannot be used to find out who sells on HordeMart.
 */
export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState(null);

  async function onSubmit(event) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/auth/password-reset/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error?.details?.[0]?.message ?? body?.error?.message ?? 'Could not send the link.');
      }
      setSent(true);
    } catch (problem) {
      setError(problem.message === 'Failed to fetch' ? 'Could not reach the server. Check your connection and try again.' : problem.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="shell">
      <PlatformHeader current="login" />
      <main className="container container--narrow auth-simple" id="main">
        <h1 className="auth__title">Reset your password</h1>
        {sent ? (
          <div className="alert alert--good" role="status">
            <span className="alert__icon" aria-hidden="true">✓</span>
            <span>
              If <strong>{email}</strong> has a HordeMart account, we have emailed it a link to choose a new password. It
              works for 1 hour. Not there? Check your spam folder.
            </span>
          </div>
        ) : (
          <>
            <p className="auth__lede">Enter the email you sign in with and we’ll send you a link to choose a new password.</p>
            <form onSubmit={onSubmit} className="card">
              {error ? (
                <div className="alert alert--error" role="alert" style={{ marginBottom: 16 }}>
                  <span className="alert__icon" aria-hidden="true">!</span>
                  <span>{error}</span>
                </div>
              ) : null}
              <div className="field">
                <label className="label" htmlFor="email">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  className="input"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </div>
              <button className="btn btn--primary btn--block" type="submit" disabled={busy} style={{ marginTop: 18 }}>
                {busy ? 'Sending…' : 'Email me a link'}
              </button>
            </form>
          </>
        )}
        <p className="auth__switch">
          <a href="/login">← Back to sign in</a>
        </p>
      </main>
    </div>
  );
}
