'use client';

import { useEffect, useState } from 'react';
import PlatformHeader from '@/components/platform/PlatformHeader';

const MIN_LENGTH = 12;

/**
 * Choose a new password from an emailed link (/reset-password?token=…).
 *
 * The token is read from the address bar and then removed from it, so it
 * does not linger in history or get copied along with the URL.
 */
export default function ResetPasswordPage() {
  const [token, setToken] = useState(null);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const value = new URLSearchParams(window.location.search).get('token');
    if (value) {
      setToken(value);
      window.history.replaceState(null, '', '/reset-password');
    } else {
      // A second run of this effect (React's development double-invoke) finds
      // the address already cleaned; keep the token it read the first time.
      setToken((current) => current ?? '');
    }
  }, []);

  async function onSubmit(event) {
    event.preventDefault();
    setError(null);
    if (password.length < MIN_LENGTH) {
      setError(`Use at least ${MIN_LENGTH} characters.`);
      return;
    }
    if (password !== confirm) {
      setError('The two passwords don’t match.');
      return;
    }
    setBusy(true);
    try {
      const response = await fetch('/api/auth/password-reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(body?.error?.details?.[0]?.message ?? body?.error?.message ?? 'Could not reset your password.');
      }
      setDone(true);
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
        <h1 className="auth__title">Choose a new password</h1>
        {done ? (
          <div className="alert alert--good" role="status">
            <span className="alert__icon" aria-hidden="true">✓</span>
            <span>
              Your password is changed, and you have been signed out everywhere else. <a href="/login">Sign in</a> with
              the new one.
            </span>
          </div>
        ) : token === '' ? (
          <div className="alert alert--error" role="alert">
            <span className="alert__icon" aria-hidden="true">!</span>
            <span>
              This page needs the link from your email. <a href="/forgot-password">Ask for a new link</a>.
            </span>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="card">
            {error ? (
              <div className="alert alert--error" role="alert" style={{ marginBottom: 16 }}>
                <span className="alert__icon" aria-hidden="true">!</span>
                <span>
                  {error}
                  {/link/i.test(error) ? (
                    <>
                      {' '}
                      <a href="/forgot-password">Ask for a new link</a>.
                    </>
                  ) : null}
                </span>
              </div>
            ) : null}
            <div className="field">
              <label className="label" htmlFor="new-password">
                New password
              </label>
              <input
                id="new-password"
                type="password"
                className="input"
                autoComplete="new-password"
                minLength={MIN_LENGTH}
                maxLength={200}
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                aria-describedby="new-password-hint"
              />
              <p id="new-password-hint" className="hint">
                At least {MIN_LENGTH} characters. A short sentence is easy to remember and hard to guess.
              </p>
            </div>
            <div className="field">
              <label className="label" htmlFor="confirm-password">
                Type it again
              </label>
              <input
                id="confirm-password"
                type="password"
                className="input"
                autoComplete="new-password"
                required
                value={confirm}
                onChange={(event) => setConfirm(event.target.value)}
              />
            </div>
            <button className="btn btn--primary btn--block" type="submit" disabled={busy || token === null} style={{ marginTop: 18 }}>
              {busy ? 'Saving…' : 'Set new password'}
            </button>
          </form>
        )}
      </main>
    </div>
  );
}
