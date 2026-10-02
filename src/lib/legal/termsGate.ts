/**
 * Page guard: a signed-in seller who has not accepted the current Terms +
 * Privacy version is sent to /accept-terms before any dashboard or admin
 * page renders, and brought back afterwards. Covers sellers who signed up
 * before acceptance was recorded, and everyone after each new version.
 */

import { redirect } from 'next/navigation';
import { needsTermsAcceptance } from './terms';

export function redirectIfTermsOutdated(
  user: { termsAcceptedVersion?: string | null },
  next: string,
): void {
  if (needsTermsAcceptance(user)) redirect(`/accept-terms?next=${encodeURIComponent(next)}`);
}
