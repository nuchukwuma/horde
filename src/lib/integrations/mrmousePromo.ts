/**
 * When to suggest MrMouse inside the dashboard.
 *
 * Only in the dashboard, never by email: a product suggestion in a
 * transactional email is marketing, with the NDPA questions that brings
 * (ADR-0010). Inside the dashboard it is part of the product.
 *
 * Shown to a store that sells (store module on), has at least one product —
 * stock is what MrMouse helps with, so before that it is noise — and has not
 * connected MrMouse. "Not now" hides it for PROMO_SNOOZE_DAYS via a host-only
 * cookie: a display preference, not personal data worth a database field.
 */

export const PROMO_COOKIE = 'hm-mrmouse-promo';
export const PROMO_SNOOZE_DAYS = 14;

export function shouldSuggestMrMouse(input: {
  storeOn: boolean;
  productCount: number;
  connected: boolean;
  snoozed: boolean;
}): boolean {
  return input.storeOn && input.productCount > 0 && !input.connected && !input.snoozed;
}
