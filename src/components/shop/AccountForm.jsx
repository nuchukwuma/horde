'use client';

import { useState } from 'react';
import TermsCheckbox from '@/components/legal/TermsCheckbox';
import PasswordInput from '@/components/auth/PasswordInput';

/**
 * Shopper sign-in and registration for one storefront.
 *
 * One component for both because the two forms differ by two fields and a
 * verb, and keeping them together means the error handling, the busy state and
 * the redirect cannot drift apart.
 *
 * No site is named anywhere in what this sends. The store is whichever host
 * the browser is already on, which is the only thing the server will accept.
 */

export default function AccountForm({ mode, storeName, next = '/', termsUrl = '/terms', privacyUrl = '/privacy' }) {
  const isSignup = mode === 'signup';

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [acceptTerms, setAcceptTerms] = useState(false);

  async function onSubmit(event) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    const endpoint = isSignup ? '/api/shop/account/signup' : '/api/shop/account/login';
    const payload = isSignup ? { name, email, password, acceptTerms } : { email, password };

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const body = await response.json();

      if (!response.ok) {
        setError(body?.error?.message ?? 'Something went wrong');
        return;
      }

      window.location.href = next;
    } catch {
      setError('Could not reach the server. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="container container--narrow" style={{ maxWidth: 420, paddingBlock: '48px 64px' }}>
      <h1 style={{ fontSize: 28, marginBottom: 6 }}>
        {isSignup ? 'Create an account' : 'Sign in'}
      </h1>
      <p style={{ color: 'var(--text-secondary)', marginTop: 0, marginBottom: 28 }}>
        {isSignup
          ? `Save your details for next time you shop at ${storeName}.`
          : `Welcome back to ${storeName}.`}
      </p>

      <form onSubmit={onSubmit} className="stack" style={{ '--stack-gap': '16px' }}>
        {error ? (
          <div className="card" role="alert" style={{ borderColor: 'var(--critical)' }}>
            {error}
          </div>
        ) : null}

        {isSignup ? (
          <div>
            <label htmlFor="name" style={labelStyle}>
              Your name
            </label>
            <input
              id="name"
              name="name"
              autoComplete="name"
              required
              maxLength={120}
              value={name}
              onChange={(event) => setName(event.target.value)}
              style={inputStyle}
            />
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
          <PasswordInput
            id="password"
            name="password"
            autoComplete={isSignup ? 'new-password' : 'current-password'}
            required
            minLength={isSignup ? 12 : undefined}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            style={inputStyle}
          />
          {isSignup ? (
            <p style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--text-secondary)' }}>
              At least 12 characters.
            </p>
          ) : null}
        </div>

        {isSignup ? (
          <TermsCheckbox checked={acceptTerms} onChange={setAcceptTerms} termsUrl={termsUrl} privacyUrl={privacyUrl}>
            {' '}(HordeMart runs this store’s accounts for {storeName})
          </TermsCheckbox>
        ) : null}

        <button className="btn btn--primary" type="submit" disabled={busy || (isSignup && !acceptTerms)}>
          {busy ? 'Please wait…' : isSignup ? 'Create account' : 'Sign in'}
        </button>

        <p style={{ fontSize: 14, color: 'var(--text-secondary)', margin: 0 }}>
          {isSignup ? (
            <>
              Already have an account? <a href="/account/login">Sign in</a>
            </>
          ) : (
            <>
              New here? <a href="/account/signup">Create an account</a>
            </>
          )}
        </p>

        {/* Stated plainly: an account is a convenience, never a toll gate. */}
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>
          You don&rsquo;t need an account to buy — you can check out as a guest.
        </p>
      </form>
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
