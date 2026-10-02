'use client';

import { useState } from 'react';
import PlatformHeader from '@/components/platform/PlatformHeader';
import StallScene from '@/components/scenes/StallScene';

/**
 * Sign in.
 *
 * The scene is a stall after hours: shutter down, lamp off. Start typing and
 * the lamp comes on; a wrong password rattles the shutter; the right one
 * rolls it up on a fully stocked shop before the dashboard loads. It is the
 * sign-in form's three states drawn as a picture — and all three are also
 * said in words, so the picture is never the only signal.
 */

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [shutter, setShutter] = useState('closed');

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
        setShutter('shake');
        setTimeout(() => setShutter('closed'), 450);
        setBusy(false);
        return;
      }

      setShutter('open');
      setTimeout(() => {
        window.location.href = body.data.redirectTo;
      }, 900);
    } catch {
      setError('Could not reach the server. Check your connection and try again.');
      setBusy(false);
    }
  }

  const scene = (
    <div className="scene scene--night">
      <StallScene name="Welcome back" stage={5} mood="night" shutter={shutter} lamp={email.length > 0 || shutter === 'open'} />
    </div>
  );

  return (
    <div className="shell">
      <PlatformHeader current="login" />

      <main className="auth" id="main">
        <div className="auth__panel">
          <div className="auth__form-wrap">
            <div className="auth__art-mobile">{scene}</div>

            <h1 className="auth__title">Welcome back</h1>
            <p className="auth__lede">Sign in to open up your shop, check sales and reply to customers.</p>

            <form onSubmit={onSubmit}>
              {/* Errors are announced, not just coloured. */}
              {error ? (
                <div className="alert alert--error" role="alert" style={{ marginBottom: 18 }}>
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
                  name="email"
                  type="email"
                  className="input"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </div>

              <div className="field">
                <div className="row row--between">
                  <label className="label" htmlFor="password">
                    Password
                  </label>
                  <a className="auth__forgot" href="/forgot-password">
                    Forgot password?
                  </a>
                </div>
                <input
                  id="password"
                  name="password"
                  type="password"
                  className="input"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </div>

              <button className="btn btn--primary btn--lg btn--block" type="submit" disabled={busy} style={{ marginTop: 22 }}>
                {busy ? (
                  <>
                    <span className="btn__spinner" aria-hidden="true" />
                    {shutter === 'open' ? 'Opening up…' : 'Signing in…'}
                  </>
                ) : (
                  'Sign in'
                )}
              </button>

              <p className="auth__switch">
                New to HordeMart? <a href="/signup">Open a shop — it&rsquo;s free</a>
              </p>
            </form>
          </div>
        </div>

        <aside className="auth__art auth__art--night" aria-hidden="true">
          {scene}
          <p className="auth__caption">Your stall is just as you left it.</p>
        </aside>
      </main>
    </div>
  );
}
