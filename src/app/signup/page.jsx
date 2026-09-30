'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Seller signup.
 *
 * One screen, not a wizard. The account and the first store are created
 * together because an account with no store can do nothing, and splitting the
 * form would leave those half-sellers in the database every time someone
 * abandons step two.
 *
 * The subdomain is checked as it is typed. Seeing "ade-store.hordemart.com is
 * yours" before submitting is the moment this product makes sense to someone,
 * and finding out it was taken after filling in a password is the moment they
 * leave.
 */

/**
 * The apex, read off the host this page is served on rather than from an
 * env var.
 *
 * This page only ever runs on APP_HOST (app.hordemart.com), so dropping the
 * first label gives the apex. Deriving it means there is no NEXT_PUBLIC_
 * variable to forget at build time and no way for the suffix shown here to
 * disagree with the address the seller's store will actually have.
 */
function rootDomain() {
  if (typeof window === 'undefined') return '';
  const { hostname, port } = window.location;
  const apex = hostname.split('.').slice(1).join('.') || hostname;
  return port ? `${apex}:${port}` : apex;
}

/** Mirrors slugSchema server-side. The server still decides; this is feedback. */
function slugify(value) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 30);
}

export default function SignupPage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [siteName, setSiteName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [slugState, setSlugState] = useState({ status: 'idle', reason: null });
  const [error, setError] = useState(null);
  // Which field a 409 blamed, so the message can sit beside it. See
  // ConflictError's details in lib/errors.ts.
  const [conflict, setConflict] = useState(null);
  const [busy, setBusy] = useState(false);

  // Keeps an in-flight availability check from overwriting a newer one.
  const checkSeq = useRef(0);

  // Resolved after mount: window does not exist during the server render, and
  // interpolating a different value there would be a hydration mismatch.
  const [apex, setApex] = useState('');
  useEffect(() => setApex(rootDomain()), []);

  // The landing page's subdomain preview sends whatever was typed there as
  // ?slug=. Carrying it in means the first thing a seller did on the marketing
  // page is not thrown away and retyped here — which would make the preview a
  // trick rather than a step.
  useEffect(() => {
    const proposed = new URLSearchParams(window.location.search).get('slug');
    if (!proposed) return;
    setSlug(slugify(proposed));
    setSlugTouched(true);
  }, []);

  // Until the seller edits the address themselves, it follows the store name.
  const effectiveSlug = slugTouched ? slug : slugify(siteName);

  const checkSlug = useCallback(async (candidate) => {
    if (!candidate || candidate.length < 3) {
      setSlugState({ status: 'idle', reason: null });
      return;
    }

    const seq = ++checkSeq.current;
    setSlugState({ status: 'checking', reason: null });

    try {
      const response = await fetch(
        `/api/auth/slug-available?slug=${encodeURIComponent(candidate)}`,
      );
      const body = await response.json();
      if (seq !== checkSeq.current) return;

      setSlugState(
        body?.data?.available
          ? { status: 'available', reason: null }
          : { status: 'taken', reason: body?.data?.reason ?? 'Not available' },
      );
    } catch {
      if (seq !== checkSeq.current) return;
      // A failed check must not block submission: the server checks again.
      setSlugState({ status: 'idle', reason: null });
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => checkSlug(effectiveSlug), 350);
    return () => clearTimeout(timer);
  }, [effectiveSlug, checkSlug]);

  async function onSubmit(event) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setConflict(null);

    try {
      const response = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password, siteName, slug: effectiveSlug }),
      });

      const body = await response.json();

      if (!response.ok) {
        setError(body?.error?.message ?? 'Could not create your account');
        setConflict(body?.error?.details?.field ?? null);
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

      <main className="container" style={{ maxWidth: 460, paddingBlock: '56px' }}>
        <h1 style={{ fontSize: 26, marginBottom: 6 }}>Create your store</h1>
        <p style={{ color: 'var(--text-secondary)', marginTop: 0, marginBottom: 28 }}>
          Your own address, your own storefront. Customers pay you directly.
        </p>

        <form onSubmit={onSubmit} className="stack" style={{ '--stack-gap': '16px' }}>
          {error ? (
            <div className="card" role="alert" style={{ borderColor: 'var(--critical)' }}>
              {error}
              {conflict === 'email' ? (
                <>
                  {' '}
                  <a href="/login">Sign in instead</a>, or use a different address.
                </>
              ) : null}
            </div>
          ) : null}

          <Field label="Your name" id="name">
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
          </Field>

          <Field label="Email" id="email">
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
          </Field>

          <Field label="Password" id="password" hint="At least 12 characters.">
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="new-password"
              required
              minLength={12}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              style={inputStyle}
            />
          </Field>

          <hr style={{ border: 0, borderTop: '1px solid var(--border)', margin: '8px 0' }} />

          <Field label="Store name" id="siteName">
            <input
              id="siteName"
              name="siteName"
              required
              maxLength={120}
              placeholder="Ade Stores"
              value={siteName}
              onChange={(event) => setSiteName(event.target.value)}
              style={inputStyle}
            />
          </Field>

          <Field label="Your address" id="slug">
            <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
              <input
                id="slug"
                name="slug"
                required
                minLength={3}
                maxLength={30}
                value={effectiveSlug}
                onChange={(event) => {
                  setSlugTouched(true);
                  setSlug(slugify(event.target.value));
                }}
                style={{ ...inputStyle, borderTopRightRadius: 0, borderBottomRightRadius: 0 }}
                aria-describedby="slug-status"
              />
              <span
                style={{
                  font: 'inherit',
                  fontSize: 15,
                  padding: '10px 12px',
                  minHeight: 42,
                  display: 'flex',
                  alignItems: 'center',
                  whiteSpace: 'nowrap',
                  color: 'var(--text-secondary)',
                  background: 'var(--surface-2)',
                  border: '1px solid var(--border-strong)',
                  borderLeft: 0,
                  borderTopRightRadius: 'var(--radius-sm)',
                  borderBottomRightRadius: 'var(--radius-sm)',
                }}
              >
                .{apex}
              </span>
            </div>

            {/* Announced, so it is not colour-only information. */}
            <p
              id="slug-status"
              role="status"
              style={{
                margin: '6px 0 0',
                fontSize: 13,
                minHeight: 18,
                color:
                  conflict === 'slug' || slugState.status === 'taken'
                    ? 'var(--critical)'
                    : slugState.status === 'available'
                      ? 'var(--success)'
                      : 'var(--text-secondary)',
              }}
            >
              {conflict === 'slug' && 'That address was taken just now — pick another.'}
              {conflict !== 'slug' && slugState.status === 'checking' && 'Checking…'}
              {conflict !== 'slug' &&
                slugState.status === 'available' &&
                `${effectiveSlug}.${apex} is available`}
              {conflict !== 'slug' && slugState.status === 'taken' && slugState.reason}
            </p>
          </Field>

          <button
            className="btn btn--primary"
            type="submit"
            disabled={busy || slugState.status === 'taken'}
          >
            {busy ? 'Creating…' : 'Create store'}
          </button>

          <p style={{ fontSize: 14, color: 'var(--text-secondary)', margin: 0 }}>
            Already have an account? <a href="/login">Sign in</a>
          </p>
        </form>
      </main>
    </div>
  );
}

function Field({ label, id, hint, children }) {
  return (
    <div>
      <label htmlFor={id} style={labelStyle}>
        {label}
      </label>
      {children}
      {hint ? (
        <p style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--text-secondary)' }}>{hint}</p>
      ) : null}
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
