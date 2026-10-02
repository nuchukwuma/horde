'use client';

import { AD_CONSENT_KEY } from './AdSlot';

/** Footer link that forgets the ad-cookie choice, so the question is asked again. */
export default function AdChoicesLink() {
  if (!process.env.NEXT_PUBLIC_ADSENSE_CLIENT) return null;
  return (
    <button
      type="button"
      className="footer__link-button"
      onClick={() => {
        try {
          window.localStorage.removeItem(AD_CONSENT_KEY);
        } catch {
          // Nothing stored to forget.
        }
        window.location.reload();
      }}
    >
      Ad choices
    </button>
  );
}
