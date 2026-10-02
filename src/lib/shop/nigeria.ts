/**
 * Delivery details for Nigerian addresses. Pure, so the checkout form and the
 * server validate against the same lists.
 */

/** The 36 states and the FCT. */
export const NIGERIAN_STATES = [
  'Abia', 'Adamawa', 'Akwa Ibom', 'Anambra', 'Bauchi', 'Bayelsa', 'Benue', 'Borno',
  'Cross River', 'Delta', 'Ebonyi', 'Edo', 'Ekiti', 'Enugu', 'FCT (Abuja)', 'Gombe',
  'Imo', 'Jigawa', 'Kaduna', 'Kano', 'Katsina', 'Kebbi', 'Kogi', 'Kwara', 'Lagos',
  'Nasarawa', 'Niger', 'Ogun', 'Ondo', 'Osun', 'Oyo', 'Plateau', 'Rivers', 'Sokoto',
  'Taraba', 'Yobe', 'Zamfara',
] as const;

export type NigerianState = (typeof NIGERIAN_STATES)[number];

/**
 * A Nigerian mobile number in one shape, +234XXXXXXXXXX, or null.
 *
 * Accepts how people actually type it — 0803 123 4567, 2348031234567,
 * +234 (803) 123-4567 — and nothing that is not one: the seller has to be
 * able to call it to arrange delivery.
 */
export function normaliseNigerianPhone(value: string): string | null {
  const raw = String(value ?? '').trim();
  if (!/^[0-9\s+().-]{10,24}$/.test(raw)) return null;
  const digits = raw.replace(/\D/g, '');
  let national: string;
  if (/^0\d{10}$/.test(digits)) national = digits.slice(1);
  else if (/^234\d{10}$/.test(digits)) national = digits.slice(3);
  else return null;
  // Mobile ranges: 070x, 080x, 081x, 090x, 091x.
  return /^[789][01]\d{8}$/.test(national) ? `+234${national}` : null;
}

/** "+2348031234567" → "0803 123 4567", for showing a seller. */
export function formatNigerianPhone(e164: string | null | undefined): string {
  if (!e164 || !/^\+234\d{10}$/.test(e164)) return e164 ?? '';
  const n = `0${e164.slice(4)}`;
  return `${n.slice(0, 4)} ${n.slice(4, 7)} ${n.slice(7)}`;
}
