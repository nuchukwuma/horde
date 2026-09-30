/**
 * All money in this system is an integer count of kobo. Never a float, never naira.
 *
 * Rates are integer basis points (bps): 1 bps = 0.01%, so 5% = 500 bps. Storing a
 * rate as 0.05 reintroduces exactly the float error that integer kobo exists to
 * prevent, so percentages get the same treatment as amounts.
 */

export const KOBO_PER_NAIRA = 100;
export const BPS_DENOMINATOR = 10_000;

/**
 * Ceiling of ~1 trillion naira. Well under Number.MAX_SAFE_INTEGER so that
 * intermediate arithmetic keeps headroom, and low enough that a value above it
 * is far more likely to be a naira/kobo unit mix-up than a real order.
 */
export const MAX_KOBO = 100_000_000_000_000;

export type Rounding = 'half-up' | 'down' | 'up';

export class MoneyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MoneyError';
  }
}

export function isKobo(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    Math.abs(value) <= MAX_KOBO
  );
}

/** Throws unless `value` is a whole, in-range number of kobo. */
export function assertKobo(value: unknown, field = 'amount'): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new MoneyError(`${field} must be a finite number of kobo, got ${String(value)}`);
  }
  if (!Number.isInteger(value)) {
    throw new MoneyError(
      `${field} must be a whole number of kobo (no fractional kobo), got ${value}`,
    );
  }
  if (Math.abs(value) > MAX_KOBO) {
    throw new MoneyError(`${field} of ${value} exceeds MAX_KOBO — check naira/kobo units`);
  }
  return value;
}

export function assertNonNegativeKobo(value: unknown, field = 'amount'): number {
  const kobo = assertKobo(value, field);
  if (kobo < 0) {
    throw new MoneyError(`${field} must not be negative, got ${kobo}`);
  }
  return kobo;
}

export function assertBps(value: unknown, field = 'rate'): number {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new MoneyError(`${field} must be an integer number of basis points, got ${String(value)}`);
  }
  if (value < 0 || value > BPS_DENOMINATOR) {
    throw new MoneyError(`${field} must be between 0 and ${BPS_DENOMINATOR} bps, got ${value}`);
  }
  return value;
}

function roundBigInt(numerator: bigint, denominator: bigint, mode: Rounding): bigint {
  const quotient = numerator / denominator;
  const remainder = numerator % denominator;
  if (remainder === 0n) return quotient;

  switch (mode) {
    case 'down':
      return quotient;
    case 'up':
      return quotient + 1n;
    case 'half-up':
      return remainder * 2n >= denominator ? quotient + 1n : quotient;
  }
}

/**
 * Apply a basis-point rate to an amount.
 *
 * The multiplication runs in BigInt because amountKobo * bps overflows
 * Number.MAX_SAFE_INTEGER for large orders — at MAX_KOBO the product is ~1e18,
 * where doubles have already stopped counting in ones.
 *
 * Default rounding is half-up. Callers that must make amounts reconcile exactly
 * (fee + net === gross) should compute one side and subtract for the other
 * rather than rounding both independently.
 */
export function applyBps(amountKobo: number, bps: number, mode: Rounding = 'half-up'): number {
  assertKobo(amountKobo, 'amountKobo');
  assertBps(bps, 'bps');

  const negative = amountKobo < 0;
  const magnitude = BigInt(Math.abs(amountKobo));
  const rounded = roundBigInt(magnitude * BigInt(bps), BigInt(BPS_DENOMINATOR), mode);
  const result = Number(rounded);

  if (!Number.isSafeInteger(result)) {
    throw new MoneyError(`applyBps overflowed a safe integer for ${amountKobo} @ ${bps}bps`);
  }
  return negative ? -result : result;
}

export function addKobo(...amounts: number[]): number {
  const total = amounts.reduce<number>((sum, amount, index) => {
    return sum + assertKobo(amount, `amounts[${index}]`);
  }, 0);
  return assertKobo(total, 'sum');
}

export function subtractKobo(minuend: number, subtrahend: number): number {
  assertKobo(minuend, 'minuend');
  assertKobo(subtrahend, 'subtrahend');
  return assertKobo(minuend - subtrahend, 'difference');
}

/** Clamp to an inclusive cap. `null` cap means uncapped. */
export function capKobo(amountKobo: number, capValue: number | null | undefined): number {
  assertKobo(amountKobo, 'amountKobo');
  if (capValue === null || capValue === undefined) return amountKobo;
  assertNonNegativeKobo(capValue, 'cap');
  return Math.min(amountKobo, capValue);
}

/**
 * Parse user- or admin-entered naira into kobo.
 *
 * Accepts a string to avoid the caller having already lost precision in a float
 * literal. Numbers are accepted for convenience but must be integral naira.
 */
export function nairaToKobo(naira: string | number): number {
  if (typeof naira === 'number') {
    if (!Number.isInteger(naira)) {
      throw new MoneyError(
        `nairaToKobo received the float ${naira}; pass a string like "${naira}" to keep precision`,
      );
    }
    return assertKobo(naira * KOBO_PER_NAIRA, 'kobo');
  }

  const trimmed = naira.trim();
  const match = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(trimmed);
  if (!match) {
    throw new MoneyError(`"${naira}" is not a valid naira amount (max 2 decimal places)`);
  }
  const [, sign, whole, fraction = ''] = match;
  const kobo = Number(whole) * KOBO_PER_NAIRA + Number(fraction.padEnd(2, '0'));
  return assertKobo(sign === '-' ? -kobo : kobo, 'kobo');
}

/** Display only. Never feed the result back into arithmetic. */
export function formatKobo(amountKobo: number, currency = 'NGN'): string {
  assertKobo(amountKobo, 'amountKobo');
  const negative = amountKobo < 0;
  const magnitude = Math.abs(amountKobo);
  const naira = Math.floor(magnitude / KOBO_PER_NAIRA);
  const remainder = magnitude % KOBO_PER_NAIRA;
  const formatted = `${naira.toLocaleString('en-NG')}.${String(remainder).padStart(2, '0')}`;
  const symbol = currency === 'NGN' ? '₦' : `${currency} `;
  return `${negative ? '-' : ''}${symbol}${formatted}`;
}

/** Mongoose field factory: every money field in the app is defined through this. */
export function koboField(options: { required?: boolean; default?: number; allowNegative?: boolean } = {}) {
  const { required = false, default: defaultValue, allowNegative = false } = options;
  return {
    type: Number,
    required,
    ...(defaultValue === undefined ? {} : { default: defaultValue }),
    validate: {
      validator(value: unknown) {
        if (value === null || value === undefined) return !required;
        return allowNegative ? isKobo(value) : isKobo(value) && (value as number) >= 0;
      },
      message(props: { path: string; value: unknown }) {
        if (!Number.isInteger(props.value)) {
          return `${props.path} must be a whole number of kobo, got ${String(props.value)}`;
        }
        if (!allowNegative && (props.value as number) < 0) {
          return `${props.path} must not be negative, got ${String(props.value)}`;
        }
        return `${props.path} is not a valid kobo amount, got ${String(props.value)}`;
      },
    },
  } as const;
}
