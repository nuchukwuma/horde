/**
 * Recorded acceptance of the Terms and Privacy Policy.
 *
 * Every place that needs consent asks for it the same way: an unticked box
 * naming exactly what is being agreed to, checked again on the server
 * (`acceptTermsSchema` — a request without `acceptTerms: true` is refused,
 * not defaulted), and stored with the version and the time. A pre-ticked
 * box, or "by continuing you agree", is not consent under the NDPA.
 */

import { z } from 'zod';
import { MRMOUSE_TERMS_VERSION, TERMS_VERSION } from '../../config/legal';

export { MRMOUSE_TERMS_VERSION, TERMS_VERSION };

export const acceptTermsSchema = z.literal(true, {
  errorMap: () => ({ message: 'Tick the box to accept the Terms and Privacy Policy' }),
});

/** Fields stamped on the record that accepted. */
export function acceptanceStamp(version: string = TERMS_VERSION, at = new Date()) {
  return { termsAcceptedVersion: version, termsAcceptedAt: at };
}

/** True when this person has not accepted the current version. */
export function needsTermsAcceptance(user: { termsAcceptedVersion?: string | null }): boolean {
  return user.termsAcceptedVersion !== TERMS_VERSION;
}

/**
 * Where to send someone after they accept. Only our own dashboard and admin
 * pages: anything else from a query string is how open redirects happen.
 */
export function safeNextPath(next: unknown): string {
  const value = typeof next === 'string' ? next : '';
  return /^\/(dashboard|admin)(\/[A-Za-z0-9/_-]*)?$/.test(value) ? value : '/dashboard';
}
