'use client';

import { useEffect, useRef, useState } from 'react';
import PasswordInput from '@/components/auth/PasswordInput';

/**
 * Change the store's address.
 *
 * Asks for the password in the same form rather than bouncing the seller to
 * a separate screen: it is confirmed first (POST /api/auth/step-up), then the
 * change is made. The server enforces both independently.
 */

function slugify(value) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 30);
}

export default function AddressForm({ siteId, currentSlug, rootDomain }) {
  const [slug, setSlug] = useState('');
  const [password, setPassword] = useState('');
  const [check, setCheck] = useState({ status: 'idle', reason: null });
  const [error, setError] = useState(null);
  const [done, setDone] = useState(null);
  const [busy, setBusy] = useState(false);
  const seq = useRef(0);

  useEffect(() => {
    if (!slug || slug.length < 3 || slug === currentSlug) {
      setCheck({ status: 'idle', reason: null });
      return undefined;
    }
    const mine = ++seq.current;
    setCheck({ status: 'checking', reason: null });
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/auth/slug-available?slug=${encodeURIComponent(slug)}`);
        const body = await response.json();
        if (mine !== seq.current) return;
        setCheck(body?.data?.available ? { status: 'free', reason: null } : { status: 'taken', reason: body?.data?.reason ?? 'Not available' });
      } catch {
        if (mine === seq.current) setCheck({ status: 'idle', reason: null });
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [slug, currentSlug]);

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const confirm = await fetch('/api/auth/step-up', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      if (!confirm.ok) {
        const body = await confirm.json();
        throw new Error(body?.error?.message ?? 'Could not confirm your password');
      }
      const response = await fetch(`/api/sites/${siteId}/slug`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error?.details?.[0]?.message ?? body?.error?.message ?? 'Could not change the address');
      setDone(body.data);
      setPassword('');
    } catch (problem) {
      setError(problem.message);
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="alert alert--good" role="status">
        <span className="alert__icon" aria-hidden="true">✓</span>
        <span>
          Your store now lives at <a href={done.storeUrl}>{done.storeUrl.replace(/^https?:\/\//, '')}</a>. Visitors to{' '}
          <strong>
            {done.previous}.{rootDomain}
          </strong>{' '}
          are sent there automatically.
        </span>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="card address-form">
      {error ? (
        <div className="alert alert--error" role="alert">
          <span className="alert__icon" aria-hidden="true">!</span>
          <span>{error}</span>
        </div>
      ) : null}

      <div className="field">
        <label className="label" htmlFor="new-slug">
          New address
        </label>
        <div className="input-group">
          <input
            id="new-slug"
            className="input"
            value={slug}
            onChange={(event) => setSlug(slugify(event.target.value))}
            minLength={3}
            maxLength={30}
            required
            aria-describedby="new-slug-status"
          />
          <span className="input-group__suffix">.{rootDomain}</span>
        </div>
        <p
          id="new-slug-status"
          role="status"
          className={`slug-status${check.status === 'free' ? ' slug-status--ok' : check.status === 'taken' ? ' slug-status--bad' : ''}`}
        >
          {check.status === 'checking' && 'Checking…'}
          {check.status === 'free' && `✓ ${slug}.${rootDomain} is available`}
          {check.status === 'taken' && `✕ ${check.reason}`}
        </p>
      </div>

      <div className="field">
        <label className="label" htmlFor="confirm-password">
          Your password
        </label>
        <PasswordInput
          id="confirm-password"
          className="input"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
        />
        <p className="hint">We ask again because your address is what customers trust.</p>
      </div>

      <button type="submit" className="btn btn--primary" disabled={busy || check.status !== 'free' || !password}>
        {busy ? 'Changing…' : 'Change address'}
      </button>
    </form>
  );
}
