#!/usr/bin/env node
/**
 * Nightly reconciliation.
 *
 *   npx tsx scripts/reconcile.ts --days 1
 *   npx tsx scripts/reconcile.ts --from 2026-09-01 --to 2026-09-30
 *
 * Exits 1 when discrepancies are found, so a cron or CI job fails loudly
 * instead of mailing a report nobody opens.
 *
 * Writes nothing. Corrections are reversing or adjusting entries made by a
 * person who read the report — see src/lib/ledger/reconcile.ts.
 */

import { connectToDatabase, disconnectFromDatabase } from '../src/lib/db/connect';
import { formatReport, reconcile } from '../src/lib/ledger/reconcile';
import '../src/lib/db/models/index';

interface Args {
  from: Date;
  to: Date;
  feeToleranceKobo: number;
}

function parseArgs(argv: string[]): Args {
  const get = (flag: string): string | undefined => {
    const index = argv.indexOf(flag);
    return index === -1 ? undefined : argv[index + 1];
  };

  const to = get('--to') ? new Date(get('--to') as string) : new Date();
  const days = Number(get('--days') ?? 1);

  const from = get('--from')
    ? new Date(get('--from') as string)
    : new Date(to.getTime() - days * 24 * 60 * 60 * 1000);

  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    throw new Error('Invalid --from/--to date');
  }

  return {
    from,
    to,
    feeToleranceKobo: Number(get('--fee-tolerance') ?? 100),
  };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  await connectToDatabase();

  try {
    const report = await reconcile({
      from: args.from,
      to: args.to,
      feeToleranceKobo: args.feeToleranceKobo,
    });

    console.log(formatReport(report));

    if (!report.clean) {
      console.error(`\nFAILED: ${report.discrepancies.length} discrepancies need review.`);
      process.exitCode = 1;
    }
  } finally {
    await disconnectFromDatabase();
  }
}

main().catch((error) => {
  console.error('Reconciliation could not run:', error);
  process.exitCode = 1;
});
