/**
 * Reconciliation: does our ledger agree with Paystack?
 *
 * READ-ONLY, deliberately. It reports discrepancies and never writes. An
 * append-only ledger that a nightly job silently "corrects" is not append-only,
 * and the correction would be the least reviewed code touching money in the
 * system. Fixes are reversing or adjusting entries, made by a person who looked
 * at the report.
 *
 * Four things go wrong, and each means something different:
 *
 *   missing_in_ledger   Paystack took money we never recorded. The worst case:
 *                       a customer paid and our seller was never credited.
 *                       Usually a webhook that never arrived or never succeeded.
 *   missing_in_paystack We recorded a sale Paystack has no record of. Either a
 *                       test fixture leaked into real data, or a bug invented
 *                       a sale.
 *   amount_mismatch     Both know about it and disagree on how much.
 *   fee_mismatch        Paystack charged a different processing fee than we
 *                       estimated. Expected and usually benign — our figure is
 *                       an estimate — but a systematic drift means the fee model
 *                       is stale.
 */

import { LedgerEntry } from '../db/models/LedgerEntry';
import { listAllTransactions } from '../paystack/refunds';
import type { PaystackCallOptions } from '../paystack/accounts';
import { runWithoutTenantScope } from '../tenant/context';

export type DiscrepancyKind =
  | 'missing_in_ledger'
  | 'missing_in_paystack'
  | 'amount_mismatch'
  | 'fee_mismatch';

export interface Discrepancy {
  kind: DiscrepancyKind;
  reference: string;
  /** Present when we have a ledger row. */
  ledgerGrossKobo?: number;
  ledgerProviderFeeKobo?: number;
  /** Present when Paystack has a record. */
  paystackAmountKobo?: number;
  paystackFeeKobo?: number;
  siteId?: string;
  note: string;
}

export interface ReconciliationReport {
  from: Date;
  to: Date;
  paystackTransactions: number;
  ledgerSales: number;
  matched: number;
  discrepancies: Discrepancy[];
  /** True when nothing needs a human. */
  clean: boolean;
}

export interface ReconcileOptions extends PaystackCallOptions {
  from: Date;
  to: Date;
  /**
   * Ignore fee differences at or below this many kobo.
   *
   * Our fee figure is an estimate for display; Paystack's is the truth. Without
   * a floor the report is a wall of one-kobo rounding noise that buries the
   * discrepancies that matter.
   */
  feeToleranceKobo?: number;
  maxPages?: number;
}

export async function reconcile(options: ReconcileOptions): Promise<ReconciliationReport> {
  const feeTolerance = options.feeToleranceKobo ?? 100;

  const transactions = await listAllTransactions(
    { from: options.from, to: options.to, status: 'success' },
    { config: options.config, maxPages: options.maxPages },
  );

  // Cross-tenant by necessity: reconciliation compares the whole platform
  // against the whole Paystack account.
  const saleEntries = await runWithoutTenantScope(
    'reconciling the ledger against Paystack, which spans every tenant',
    () =>
      LedgerEntry.find({
        entryType: 'sale',
        createdAt: { $gte: options.from, $lte: options.to },
      }).lean(),
  );

  const byReference = new Map<string, (typeof saleEntries)[number]>();
  for (const entry of saleEntries) {
    const reference = entry.paystack?.reference;
    if (reference) byReference.set(reference, entry);
  }

  const discrepancies: Discrepancy[] = [];
  const seen = new Set<string>();
  let matched = 0;

  for (const transaction of transactions) {
    seen.add(transaction.reference);
    const entry = byReference.get(transaction.reference);

    if (!entry) {
      discrepancies.push({
        kind: 'missing_in_ledger',
        reference: transaction.reference,
        paystackAmountKobo: transaction.amount,
        paystackFeeKobo: transaction.fees ?? undefined,
        note:
          'Paystack recorded a successful charge with no matching ledger entry. ' +
          'Check whether the webhook was delivered and processed.',
      });
      continue;
    }

    let flagged = false;

    if (entry.grossKobo !== transaction.amount) {
      discrepancies.push({
        kind: 'amount_mismatch',
        reference: transaction.reference,
        ledgerGrossKobo: entry.grossKobo,
        paystackAmountKobo: transaction.amount,
        siteId: String(entry.siteId),
        note: 'Ledger and Paystack disagree on the amount charged.',
      });
      flagged = true;
    }

    const paystackFee = transaction.fees ?? null;
    if (paystackFee !== null && Math.abs(entry.providerFeeKobo - paystackFee) > feeTolerance) {
      discrepancies.push({
        kind: 'fee_mismatch',
        reference: transaction.reference,
        ledgerProviderFeeKobo: entry.providerFeeKobo,
        paystackFeeKobo: paystackFee,
        siteId: String(entry.siteId),
        note:
          'Processing fee differs beyond tolerance. A systematic drift means ' +
          'DEFAULT_PAYSTACK_FEES no longer matches Paystack pricing.',
      });
      flagged = true;
    }

    if (!flagged) matched += 1;
  }

  for (const [reference, entry] of byReference) {
    if (seen.has(reference)) continue;

    discrepancies.push({
      kind: 'missing_in_paystack',
      reference,
      ledgerGrossKobo: entry.grossKobo,
      siteId: String(entry.siteId),
      note:
        'The ledger records a sale Paystack has no successful transaction for ' +
        'in this window. Check the window boundaries before assuming a bug.',
    });
  }

  return {
    from: options.from,
    to: options.to,
    paystackTransactions: transactions.length,
    ledgerSales: saleEntries.length,
    matched,
    discrepancies,
    clean: discrepancies.length === 0,
  };
}

/** Human-readable report for a terminal or an email. */
export function formatReport(report: ReconciliationReport): string {
  const lines: string[] = [
    `Reconciliation ${report.from.toISOString()} → ${report.to.toISOString()}`,
    `  Paystack successful transactions: ${report.paystackTransactions}`,
    `  Ledger sale entries:              ${report.ledgerSales}`,
    `  Matched cleanly:                  ${report.matched}`,
    `  Discrepancies:                    ${report.discrepancies.length}`,
    '',
  ];

  if (report.clean) {
    lines.push('  No discrepancies.');
    return lines.join('\n');
  }

  const grouped = new Map<DiscrepancyKind, Discrepancy[]>();
  for (const discrepancy of report.discrepancies) {
    const list = grouped.get(discrepancy.kind) ?? [];
    list.push(discrepancy);
    grouped.set(discrepancy.kind, list);
  }

  // Most alarming first: a charge we never recorded outranks a fee rounding.
  const order: DiscrepancyKind[] = [
    'missing_in_ledger',
    'amount_mismatch',
    'missing_in_paystack',
    'fee_mismatch',
  ];

  for (const kind of order) {
    const items = grouped.get(kind);
    if (!items?.length) continue;

    lines.push(`  ${kind} (${items.length}):`);
    for (const item of items.slice(0, 50)) {
      lines.push(
        `    ${item.reference}` +
          (item.ledgerGrossKobo === undefined ? '' : ` ledger=${item.ledgerGrossKobo}`) +
          (item.paystackAmountKobo === undefined ? '' : ` paystack=${item.paystackAmountKobo}`) +
          (item.ledgerProviderFeeKobo === undefined
            ? ''
            : ` ledgerFee=${item.ledgerProviderFeeKobo}`) +
          (item.paystackFeeKobo === undefined ? '' : ` paystackFee=${item.paystackFeeKobo}`),
      );
    }
    if (items.length > 50) lines.push(`    … and ${items.length - 50} more`);
    lines.push('');
  }

  return lines.join('\n');
}
