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

export default function AdSlot({ slot, label = 'Advertisement', minHeight = 100 }) {
  const [allowed, setAllowed] = useState(false);
  const pushed = useRef(false);

  useEffect(() => {
    if (!CLIENT || !slot) return;

    const apex = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? '';
    setAllowed(isPlatformHostname(window.location.hostname, apex));
  }, [slot]);

  useEffect(() => {
    if (!allowed || pushed.current) return;
    pushed.current = true;

    try {
      // The loader reads the <ins> elements already in the DOM.
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch {
      // A blocked or failed loader must not break the page around it. Ad
      // blockers are common and this is the expected path for many visitors.
    }
  }, [allowed]);

  if (!CLIENT || !slot || !allowed) return null;

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
