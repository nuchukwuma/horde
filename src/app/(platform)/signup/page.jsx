'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import TermsCheckbox from '@/components/legal/TermsCheckbox';
import PlatformHeader from '@/components/platform/PlatformHeader';
import StallScene from '@/components/scenes/StallScene';
import PasswordInput from '@/components/auth/PasswordInput';

/**
 * Seller signup.
 *
 * One screen, not a wizard. The account and the first store are created
 * together because an account with no store can do nothing, and splitting the
 * form would leave half-sellers in the database every time someone abandons
 * step two.
 *
 * The stall beside the form is built as the form is filled: the seller turns
 * up when you give your name, the frame goes up with a valid email, the
 * shelves fill with a strong password, the sign gets your shop's name, and the
 * OPEN card flips when your address is confirmed free. It turns a form into
 * watching your shop get built — and it doubles as a progress indicator,
 * repeated in text in the checklist under it.
 */

/**
 * The apex, read off the host this page is served on.
 *
 * This page only ever runs on APP_HOST (app.hordemart.com), so dropping the
 * first label gives the apex, and the suffix shown here cannot disagree with
 * the address the store will actually have.
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

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Rough strength for the meter. The only rule enforced is the length. */
function passwordScore(value) {
  if (value.length === 0) return 0;
  if (value.length < 12) return 1;
  let score = 2;
  if (value.length >= 16) score += 1;
  if (/[A-Z]/.test(value) + /[0-9]/.test(value) + /[^A-Za-z0-9]/.test(value) >= 2) score += 1;
  return Math.min(score, 4);
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
  // Which field a 409 blamed, so the message can sit beside it.
  const [conflict, setConflict] = useState(null);
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [busy, setBusy] = useState(false);
  const [opened, setOpened] = useState(false);

  // Keeps an in-flight availability check from overwriting a newer one.
  const checkSeq = useRef(0);

  // Resolved after mount: window does not exist during the server render.
  const [apex, setApex] = useState('');
  useEffect(() => setApex(rootDomain()), []);

  // The landing page sends whatever was typed there as ?slug=, so the first
  // thing a seller did on the marketing page is not thrown away here.
  useEffect(() => {
    const proposed = new URLSearchParams(window.location.search).get('slug');
    if (!proposed) return;
    setSlug(slugify(proposed));
    setSlugTouched(true);
    setSiteName((current) =>
      current ||
      proposed
        .replace(/[-_]+/g, ' ')
        .replace(/\b\w/g, (letter) => letter.toUpperCase())
        .slice(0, 60),
    );
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
      const response = await fetch(`/api/auth/slug-available?slug=${encodeURIComponent(candidate)}`);
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

  const progress = [
    { label: 'You', done: name.trim().length > 0 },
    { label: 'Email', done: EMAIL.test(email.trim()) },
    { label: 'Password', done: password.length >= 12 },
    { label: 'Shop name', done: siteName.trim().length > 0 },
    { label: 'Address', done: slugState.status === 'available' && conflict !== 'slug' },
  ];
  const stage = opened ? 5 : progress.filter((step) => step.done).length;
  const score = passwordScore(password);

  async function onSubmit(event) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setConflict(null);

    try {
      const response = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password, siteName, slug: effectiveSlug, acceptTerms }),
      });

      const body = await response.json();

      if (!response.ok) {
        setError(body?.error?.message ?? 'Could not create your account');
        setConflict(body?.error?.details?.field ?? null);
        setBusy(false);
        return;
      }

      // Let the OPEN card flip before leaving. Short enough not to be a wait.
      setOpened(true);
      setTimeout(() => {
        window.location.href = body.data.redirectTo;
      }, 650);
    } catch {
      setError('Could not reach the server. Check your connection and try again.');
      setBusy(false);
    }
  }

  const scene = (
    <div className="scene">
      <StallScene name={siteName.trim() || 'Your shop'} stage={stage} />
      <div className="scene__address" aria-hidden="true">
        <span>🔒</span>
        <span>
          <span className="scene__address-slug">{effectiveSlug || 'your-shop'}</span>.{apex || 'hordemart.com'}
        </span>
      </div>
    </div>
  );

  return (
    <div className="shell">
      <PlatformHeader cta={false} />

      <main className="auth" id="main">
        <div className="auth__panel">
          <div className="auth__form-wrap">
            <div className="auth__art-mobile">{scene}</div>

            <h1 className="auth__title">Open your shop</h1>
            <p className="auth__lede">
              Your own address and storefront, in about two minutes. Customers pay you directly.
            </p>

            <form onSubmit={onSubmit} noValidate={false}>
              {error ? (
                <div className="alert alert--error" role="alert" style={{ marginBottom: 18 }}>
                  <span className="alert__icon" aria-hidden="true">!</span>
                  <span>
                    {error}
                    {conflict === 'email' ? (
                      <>
                        {' '}
                        <a href="/login">Sign in instead</a>, or use a different address.
                      </>
                    ) : null}
                  </span>
                </div>
              ) : null}

              <div className="field">
                <label className="label" htmlFor="name">
                  Your name
                </label>
                <input
                  id="name"
                  name="name"
                  className="input"
                  autoComplete="name"
                  required
                  maxLength={120}
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                />
              </div>

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
                  aria-invalid={conflict === 'email' ? 'true' : undefined}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </div>

              <div className="field">
                <label className="label" htmlFor="password">
                  Password
                </label>
                <PasswordInput
                  id="password"
                  name="password"
                  className="input"
                  autoComplete="new-password"
                  required
                  minLength={12}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  aria-describedby="password-hint"
                />
                <div className="password-meter" data-score={score} aria-hidden="true">
                  <span />
                  <span />
                  <span />
                  <span />
                </div>
                <p className="hint" id="password-hint">
                  At least 12 characters. A short sentence is easier to remember than symbols.
                </p>
              </div>

              <hr className="divider" />

              <div className="field">
                <label className="label" htmlFor="siteName">
                  Shop name
                </label>
                <input
                  id="siteName"
                  name="siteName"
                  className="input"
                  required
                  maxLength={120}
                  placeholder="Ade Stores"
                  value={siteName}
                  onChange={(event) => setSiteName(event.target.value)}
                />
              </div>

              <div className="field">
                <label className="label" htmlFor="slug">
                  Your address
                </label>
                <div className="input-group">
                  <input
                    id="slug"
                    name="slug"
                    className="input"
                    required
                    minLength={3}
                    maxLength={30}
                    value={effectiveSlug}
                    onChange={(event) => {
                      setSlugTouched(true);
                      setSlug(slugify(event.target.value));
                    }}
                    aria-describedby="slug-status"
                    aria-invalid={conflict === 'slug' || slugState.status === 'taken' ? 'true' : undefined}
                  />
                  <span className="input-group__suffix">.{apex}</span>
                </div>

                {/* Announced, so it is not colour-only information. */}
                <p
                  id="slug-status"
                  role="status"
                  className={`slug-status${
                    conflict === 'slug' || slugState.status === 'taken'
                      ? ' slug-status--bad'
                      : slugState.status === 'available'
                        ? ' slug-status--ok'
                        : ''
                  }`}
                >
                  {conflict === 'slug' && 'That address was taken just now — pick another.'}
                  {conflict !== 'slug' && slugState.status === 'checking' && 'Checking…'}
                  {conflict !== 'slug' &&
                    slugState.status === 'available' &&
                    `✓ ${effectiveSlug}.${apex} is yours if you want it`}
                  {conflict !== 'slug' && slugState.status === 'taken' && `✕ ${slugState.reason}`}
                </p>
              </div>

              <div style={{ marginTop: 20 }}>
                <TermsCheckbox checked={acceptTerms} onChange={setAcceptTerms} />
              </div>

              <button
                className="btn btn--primary btn--lg btn--block"
                type="submit"
                disabled={busy || slugState.status === 'taken' || !acceptTerms}
                style={{ marginTop: 22 }}
              >
                {busy ? (
                  <>
                    <span className="btn__spinner" aria-hidden="true" /> Opening your shop…
                  </>
                ) : (
                  'Open my shop'
                )}
              </button>


              <p className="auth__switch">
                Already selling with us? <a href="/login">Sign in</a>
              </p>
            </form>
          </div>
        </div>

        <aside className="auth__art" aria-label="Your shop, as you build it">
          {scene}
          <p className="auth__caption">
            {stage >= 5 ? 'Open for business. 🎉' : 'Watch your stall go up as you fill this in.'}
          </p>
          <ul className="auth__progress">
            {progress.map((step) => (
              <li key={step.label} className={step.done ? 'is-done' : ''}>
                {step.label}
              </li>
            ))}
          </ul>
        </aside>
      </main>
    </div>
  );
}
