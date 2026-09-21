/**
 * Query-string parsing for list endpoints.
 *
 * Invalid values are ignored rather than rejected. A truncated or hand-edited
 * URL should show the default view, not an error page — these are navigation
 * parameters, not a request body where a wrong value could move money.
 */

export interface DateRange {
  from?: Date;
  to?: Date;
}

export function parseDateRange(params: URLSearchParams): DateRange {
  const range: DateRange = {};

  const from = parseDate(params.get('from'));
  if (from) range.from = from;

  const to = parseDate(params.get('to'));
  if (to) range.to = to;

  // A backwards range would silently return nothing; drop the bound instead.
  if (range.from && range.to && range.from > range.to) {
    delete range.to;
  }

  return range;
}

function parseDate(raw: string | null): Date | undefined {
  if (!raw) return undefined;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

export function parseLimit(params: URLSearchParams, fallback = 50, max = 200): number {
  const raw = Number(params.get('limit'));
  if (!Number.isFinite(raw) || raw < 1) return fallback;
  return Math.min(Math.floor(raw), max);
}
