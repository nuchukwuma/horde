'use client';

import { useState } from 'react';
import PasswordInput from '@/components/auth/PasswordInput';

/** Upgrade to Premium, or stop it renewing. The server does the checking. */
export default function BillingActions({ siteId, mode, available }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [password, setPassword] = useState('');
  const [done, setDone] = useState(false);

  async function upgrade() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/sites/${siteId}/billing/upgrade`, { method: 'POST' });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error?.message ?? 'Could not start the upgrade');
      window.location.href = body.data.authorizationUrl;
    } catch (problem) {
      setError(problem.message);
      setBusy(false);
    }
  }

  async function cancel(event) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const confirm = await fetch('/api/auth/step-up', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      if (!confirm.ok) throw new Error((await confirm.json())?.error?.message ?? 'Could not confirm your password');
      const response = await fetch(`/api/sites/${siteId}/billing/cancel`, { method: 'POST' });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error?.message ?? 'Could not cancel');
      setDone(true);
    } catch (problem) {
      setError(problem.message);
    } finally {
      setBusy(false);
    }
  }

  if (mode === 'upgrade') {
    return (
      <div>
        <button type="button" className="btn btn--primary btn--lg" onClick={upgrade} disabled={busy || !available}>
          {busy ? 'Opening Paystack…' : 'Upgrade to Premium'}
        </button>
        {!available ? <p className="hint">Premium is not on sale yet.</p> : null}
        {error ? (
          <p className="ed-error" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    );
  }

  if (done) {
    return <p className="alert alert--good">Premium will not renew. You keep it until the end of the period you paid for.</p>;
  }

  return (
    <form onSubmit={cancel} className="billing-cancel">
      <label className="label" htmlFor="cancel-password">
        Confirm your password to stop Premium renewing
      </label>
      <div className="row row--wrap">
        <PasswordInput
          id="cancel-password"
          className="input"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
          wrapperStyle={{ maxWidth: 260, flex: '1 1 200px' }}
        />
        <button type="submit" className="btn btn--danger" disabled={busy || !password}>
          {busy ? 'Cancelling…' : 'Stop renewing'}
        </button>
      </div>
      {error ? (
        <p className="ed-error" role="alert">
          {error}
        </p>
      ) : null}
    </form>
  );
}
