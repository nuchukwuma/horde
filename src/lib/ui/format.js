/**
 * Display formatting.
 *
 * Kobo comes in, a string goes out. Nothing here feeds arithmetic — a number
 * that has been through a formatter is no longer a number you can add up, which
 * is why every amount stays integer kobo right up to this boundary.
 */

const NAIRA = '₦';

/** Full precision: ₦12,500.75 */
export function formatNaira(amountKobo) {
  const negative = amountKobo < 0;
  const magnitude = Math.abs(Math.trunc(amountKobo));
  const naira = Math.floor(magnitude / 100);
  const kobo = magnitude % 100;

  const grouped = naira.toLocaleString('en-NG');
  return `${negative ? '-' : ''}${NAIRA}${grouped}.${String(kobo).padStart(2, '0')}`;
}

/**
 * Compact, for headline figures where the kobo are noise: ₦1.2m
 *
 * Only ever for display beside a precise figure or a tooltip — never as the
 * only rendering of an amount a seller needs to reconcile.
 */
export function formatNairaCompact(amountKobo) {
  const naira = Math.abs(amountKobo) / 100;
  const sign = amountKobo < 0 ? '-' : '';

  if (naira >= 1_000_000) return `${sign}${NAIRA}${(naira / 1_000_000).toFixed(1)}m`;
  if (naira >= 10_000) return `${sign}${NAIRA}${Math.round(naira / 1_000)}k`;
  return formatNaira(amountKobo);
}

export function formatDate(value) {
  if (!value) return '';
  return new Date(value).toLocaleDateString('en-NG', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function formatDateTime(value) {
  if (!value) return '';
  return new Date(value).toLocaleString('en-NG', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
