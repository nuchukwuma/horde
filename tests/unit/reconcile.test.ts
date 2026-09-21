/**
 * Reconciliation report formatting and discrepancy ranking.
 *
 * The comparison itself needs a database and lives in the integration suite.
 * What is tested here is that the report puts the alarming things first and
 * says enough for someone to act without opening a database client.
 */

import { describe, expect, it } from 'vitest';
import { formatReport, type ReconciliationReport } from '../../src/lib/ledger/reconcile';

const base: ReconciliationReport = {
  from: new Date('2026-09-01T00:00:00.000Z'),
  to: new Date('2026-09-02T00:00:00.000Z'),
  paystackTransactions: 10,
  ledgerSales: 10,
  matched: 10,
  discrepancies: [],
  clean: true,
};

describe('a clean report says so plainly', () => {
  it('reports no discrepancies', () => {
    const output = formatReport(base);
    expect(output).toContain('No discrepancies');
    expect(output).toContain('Matched cleanly:                  10');
  });

  it('includes the window it covered', () => {
    // A report without its window is unactionable a day later.
    const output = formatReport(base);
    expect(output).toContain('2026-09-01T00:00:00.000Z');
    expect(output).toContain('2026-09-02T00:00:00.000Z');
  });
});

describe('discrepancies are ranked by how much they should worry you', () => {
  const report: ReconciliationReport = {
    ...base,
    matched: 6,
    clean: false,
    discrepancies: [
      {
        kind: 'fee_mismatch',
        reference: 'hm_fee',
        ledgerProviderFeeKobo: 15_000,
        paystackFeeKobo: 17_500,
        note: 'fee drift',
      },
      {
        kind: 'missing_in_ledger',
        reference: 'hm_missing',
        paystackAmountKobo: 1_000_000,
        note: 'paid but unrecorded',
      },
      {
        kind: 'amount_mismatch',
        reference: 'hm_amount',
        ledgerGrossKobo: 1_000_000,
        paystackAmountKobo: 900_000,
        note: 'disagree',
      },
    ],
  };

  it('puts a charge we never recorded above a fee rounding', () => {
    const output = formatReport(report);

    // A customer paying with nothing recorded is the scenario that loses money
    // and trust; a 25 kobo fee difference is not.
    expect(output.indexOf('missing_in_ledger')).toBeLessThan(output.indexOf('fee_mismatch'));
    expect(output.indexOf('amount_mismatch')).toBeLessThan(output.indexOf('fee_mismatch'));
  });

  it('shows both sides of a mismatch so it can be judged without a query', () => {
    const output = formatReport(report);
    expect(output).toContain('ledger=1000000');
    expect(output).toContain('paystack=900000');
  });

  it('counts each category', () => {
    const output = formatReport(report);
    expect(output).toContain('missing_in_ledger (1)');
    expect(output).toContain('Discrepancies:                    3');
  });
});

describe('a large report stays readable', () => {
  it('truncates long lists but says how many were hidden', () => {
    const report: ReconciliationReport = {
      ...base,
      clean: false,
      discrepancies: Array.from({ length: 75 }, (_, index) => ({
        kind: 'fee_mismatch' as const,
        reference: `hm_${index}`,
        ledgerProviderFeeKobo: 15_000,
        paystackFeeKobo: 15_500,
        note: 'drift',
      })),
    };

    const output = formatReport(report);
    expect(output).toContain('and 25 more');
    // Truncated, not silently dropped.
    expect(output).toContain('fee_mismatch (75)');
  });
});
