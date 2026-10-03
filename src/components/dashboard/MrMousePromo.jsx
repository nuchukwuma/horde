'use client';

import { useState } from 'react';

const COOKIE = 'hm-mrmouse-promo';
const SNOOZE_SECONDS = 60 * 60 * 24 * 14;

/**
 * "Try MrMouse", in two sizes: a card on the overview, a one-line tip on the
 * products page. "Not now" hides both for two weeks (lib/integrations/mrmousePromo.ts).
 */
export default function MrMousePromo({ siteId, variant = 'card', androidUrl = null, iosUrl = null }) {
  const [hidden, setHidden] = useState(false);
  if (hidden) return null;

  function snooze() {
    // Host-only (no Domain), like every cookie here: seller subdomains must not see it.
    const secure = window.location.protocol === 'https:' ? '; Secure' : '';
    document.cookie = `${COOKIE}=snoozed; Max-Age=${SNOOZE_SECONDS}; Path=/; SameSite=Lax${secure}`;
    setHidden(true);
  }

  const href = `/dashboard/${siteId}/mrmouse`;

  if (variant === 'tip') {
    return (
      <div className="mm-tip">
        <span className="mm-tip__mark" aria-hidden="true">
          M
        </span>
        <p>
          <strong>Selling on WhatsApp or at a stall too?</strong> Record those sales in MrMouse and your stock here
          stays right. <a href={href}>See how →</a>
        </p>
        <button type="button" className="mm-tip__close" onClick={snooze} aria-label="Hide this tip for two weeks">
          ×
        </button>
      </div>
    );
  }

  return (
    <section className="card mm-promo" aria-labelledby="mm-promo-title">
      <div className="mm-promo__head">
        <span className="mm-promo__mark" aria-hidden="true">
          M
        </span>
        <div>
          <p className="mm-promo__kicker">From the HordeMart family</p>
          <h2 id="mm-promo-title" className="mm-promo__title">
            Run the whole business from your phone with MrMouse
          </h2>
        </div>
      </div>
      <ul className="mm-promo__points">
        <li>
          <strong>Stock that stays right.</strong> Every sale on this store comes off your MrMouse stock by itself —
          and sales you make in person or on WhatsApp come off here.
        </li>
        <li>
          <strong>Books without a bookkeeper.</strong> Money in, money out and profit, written down as you go.
        </li>
        <li>
          <strong>Works with poor network.</strong> Keep recording offline; it catches up when you’re back online.
        </li>
      </ul>
      <div className="mm-promo__actions">
        <a className="btn btn--primary" href={href}>
          Try MrMouse
        </a>
        {androidUrl ? (
          <a className="btn" href={androidUrl} target="_blank" rel="noopener noreferrer">
            Get it on Android
          </a>
        ) : null}
        {iosUrl ? (
          <a className="btn" href={iosUrl} target="_blank" rel="noopener noreferrer">
            Get it on iPhone
          </a>
        ) : null}
        <button type="button" className="btn btn--ghost mm-promo__later" onClick={snooze}>
          Not now
        </button>
      </div>
      <p className="hint" style={{ margin: '10px 0 0' }}>
        MrMouse is a separate app with its own account and plans. Connecting it is your choice and you can disconnect
        at any time.
      </p>
    </section>
  );
}
