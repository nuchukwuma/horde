'use client';

import { useState } from 'react';

/**
 * Type a shop name, watch the address appear.
 *
 * This is the one interactive idea on the page, and it is here because it IS
 * the product. "You get your own site on your own address" is an abstraction
 * until someone sees their own name in a URL bar; then it is obvious. It also
 * does real work — whatever is typed is carried into /signup as the proposed
 * slug, so the first thing a seller does on the landing page is the first
 * thing they would have done in the form anyway.
 *
 * Validation is deliberately loose here. This mirrors what the real signup
 * form and `slugSchema` will do, but it is a preview, not a gate: the server
 * decides, and being told "no" by a landing page you have not signed up to is
 * a bad first interaction. The only thing enforced is the character set, so
 * the address shown is always a plausible one.
 */

/** Mirrors slugify in app/signup/page.jsx, which mirrors slugSchema. */
function toSlug(value) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-/, '')
    .slice(0, 30);
}

export default function SubdomainPreview({ rootDomain = 'hordemart.com' }) {
  const [name, setName] = useState('');

  const slug = toSlug(name);
  const shown = slug || 'your-shop';
  const href = slug ? `/signup?slug=${encodeURIComponent(slug)}` : '/signup';

  return (
    <div className="chrome">
      <div className="chrome__bar">
        <div className="chrome__dots" aria-hidden="true">
          <span className="chrome__dot" />
          <span className="chrome__dot" />
          <span className="chrome__dot" />
        </div>

        {/* Not a form field — the real input is below. This is the preview. */}
        <div className="chrome__address">
          <span aria-hidden="true">🔒</span>
          <span>
            <span className="chrome__slug">{shown}</span>
            <span style={{ color: 'var(--text-muted)' }}>.{rootDomain}</span>
          </span>
        </div>
      </div>

      <div className="chrome__body">
        <label
          htmlFor="shop-name"
          style={{ display: 'block', fontSize: 13, fontWeight: 620, marginBottom: 6 }}
        >
          What do you sell as?
        </label>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input
            id="shop-name"
            name="shopName"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Ade Stores"
            maxLength={40}
            autoComplete="organization"
            style={{
              flex: '1 1 12rem',
              minWidth: 0,
              font: 'inherit',
              fontSize: 15,
              padding: '10px 12px',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border-strong)',
              background: 'var(--surface-1)',
              color: 'var(--text-primary)',
              minHeight: 44,
            }}
          />

          <a className="btn btn--primary" href={href} style={{ minHeight: 44 }}>
            Claim it
          </a>
        </div>

        {/* Announced, so the address is available to a screen reader without
            relying on watching the bar above change. */}
        <p role="status" style={{ margin: '10px 0 0', fontSize: 13.5, color: 'var(--text-secondary)' }}>
          {slug
            ? `Your customers would visit ${shown}.${rootDomain}`
            : 'Free to start. You can change it later.'}
        </p>
      </div>
    </div>
  );
}
