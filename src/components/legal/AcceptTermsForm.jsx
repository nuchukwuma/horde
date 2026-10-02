'use client';

import { useState } from 'react';
import TermsCheckbox from './TermsCheckbox';
import SignOutButton from '@/components/auth/SignOutButton';

export default function AcceptTermsForm({ next }) {
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/auth/accept-terms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ acceptTerms: accepted }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error?.details?.[0]?.message ?? body?.error?.message ?? 'Could not save. Try again.');
      }
      window.location.assign(next);
    } catch (problem) {
      setError(problem.message);
      setBusy(false);
    }
  }

  return (
    <form className="card" onSubmit={submit}>
      {error ? (
        <div className="alert alert--error" role="alert" style={{ marginBottom: 14 }}>
          <span className="alert__icon" aria-hidden="true">!</span>
          <span>{error}</span>
        </div>
      ) : null}
      <TermsCheckbox checked={accepted} onChange={setAccepted} />
      <div className="product-form__actions" style={{ marginTop: 18 }}>
        <button type="submit" className="btn btn--primary" disabled={!accepted || busy}>
          {busy ? 'Saving…' : 'Accept and continue'}
        </button>
        <SignOutButton endpoint="/api/auth/logout" redirectTo="/login">
          Not now — sign out
        </SignOutButton>
      </div>
    </form>
  );
}
