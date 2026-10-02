'use client';

import { useEffect, useRef, useState } from 'react';
import Script from 'next/script';

/**
 * An AdSense slot for PLATFORM pages only.
 *
 * Two independent guards keep this off storefronts, because one guard is a
 * guard someone edits:
 *
 *   1. The CSP. A tenant host is served `script-src 'self'`, so even if this
 *      component were rendered there the loader would be blocked by the
 *      browser. See lib/security/csp.ts.
 *   2. This component's own host check, below. It refuses to render unless the
 *      hostname is the apex or the app host.
 *
 * Why so careful: ads on a seller's subdomain would mean relaxing script-src
 * on an origin that renders seller-authored HTML and shares a registrable
 * domain with the dashboard. The inventory is not worth it.
 *
 * Renders nothing at all when NEXT_PUBLIC_ADSENSE_CLIENT is unset, so the
 * layout is identical with ads off — no reserved gap, no placeholder.
 */

const CLIENT = process.env.NEXT_PUBLIC_ADSENSE_CLIENT ?? '';

/**
 * True only on the platform's own hosts.
 *
 * Derived from the browser's own hostname rather than passed in as a prop: a
 * prop is something a future caller can get wrong on a page that happens to
 * render on a tenant host.
 *
 * Requires NEXT_PUBLIC_ROOT_DOMAIN to know which hostnames are ours. Returns
 * false when it is unset, so a missing variable means no ads rather than ads
 * everywhere — the failure direction that cannot hurt. Ads already need
 * explicit configuration (a publisher id and slot ids), so one more required
 * variable costs nothing and buys a guard that fails closed.
 */
function isPlatformHostname(hostname, apex) {
  if (!apex) return false;
  // Port is stripped: NEXT_PUBLIC_ROOT_DOMAIN may carry one in development.
  const bare = apex.split(':')[0];
  return hostname === bare || hostname === `app.${bare}` || hostname === `www.${bare}`;
}

/**
 * Ad cookies need the visitor's consent first (NDPA 2023): nothing from
 * Google loads until they press "Allow ads". The choice is kept in this
 * browser only; "Ad choices" in the footer clears it (AdChoicesLink).
 */
export const AD_CONSENT_KEY = 'hm-ad-consent';

function readConsent() {
  try {
    return window.localStorage.getItem(AD_CONSENT_KEY);
  } catch {
    return null;
  }
}

function writeConsent(value) {
  try {
    window.localStorage.setItem(AD_CONSENT_KEY, value);
  } catch {
    // Storage blocked: the choice lasts for this page view only.
  }
}

export default function AdSlot({ slot, label = 'Advertisement', minHeight = 100 }) {
  const [allowed, setAllowed] = useState(false);
  const [consent, setConsent] = useState(null);
  const pushed = useRef(false);

  useEffect(() => {
    if (!CLIENT || !slot) return;

    const apex = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? '';
    setAllowed(isPlatformHostname(window.location.hostname, apex));
    setConsent(readConsent() ?? 'ask');
  }, [slot]);

  function choose(value) {
    writeConsent(value);
    setConsent(value);
  }

  useEffect(() => {
    if (!allowed || consent !== 'granted' || pushed.current) return;
    pushed.current = true;

    try {
      // The loader reads the <ins> elements already in the DOM.
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch {
      // A blocked or failed loader must not break the page around it. Ad
      // blockers are common and this is the expected path for many visitors.
    }
  }, [allowed, consent]);

  if (!CLIENT || !slot || !allowed || consent === null || consent === 'denied') return null;

  if (consent !== 'granted') {
    return (
      <aside className="ad-consent" aria-label="Advertising cookies">
        <p>
          This page can show ads from Google, which uses cookies to choose them.{' '}
          <a href="/privacy#cookies">How we use cookies</a>
        </p>
        <div className="ad-consent__actions">
          <button type="button" className="btn btn--sm" onClick={() => choose('granted')}>
            Allow ads
          </button>
          <button type="button" className="btn btn--sm btn--quiet" onClick={() => choose('denied')}>
            No thanks
          </button>
        </div>
      </aside>
    );
  }

  return (
    <aside
      // Labelled and marked as complementary so it is skippable and never
      // mistaken for the page's own content.
      aria-label={label}
      style={{ minHeight, margin: '24px 0' }}
    >
      <p
        style={{
          fontSize: 11,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          color: 'var(--text-muted)',
          margin: '0 0 6px',
        }}
      >
        {label}
      </p>

      <Script
        id="adsense-loader"
        strategy="afterInteractive"
        crossOrigin="anonymous"
        src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${CLIENT}`}
      />

      <ins
        className="adsbygoogle"
        style={{ display: 'block' }}
        data-ad-client={CLIENT}
        data-ad-slot={slot}
        data-ad-format="auto"
        data-full-width-responsive="true"
      />
    </aside>
  );
}
