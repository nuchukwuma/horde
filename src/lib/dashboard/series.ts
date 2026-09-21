/**
 * Daily revenue series for the dashboard chart.
 *
 * Buckets by day in the ledger rather than in JavaScript, and fills gaps with
 * zeros: a line that skips empty days silently compresses time and makes a quiet
 * week look like a busy one.
 */

import { LedgerEntry } from '../db/models/LedgerEntry';

export interface RevenuePoint {
  date: Date;
  label: string;
  grossKobo: number;
  netKobo: number;
}

export async function dailyRevenue(days = 30): Promise<RevenuePoint[]> {
  const to = new Date();
  const from = new Date(to.getTime() - (days - 1) * 24 * 60 * 60 * 1000);
  from.setHours(0, 0, 0, 0);

  const rows = await LedgerEntry.aggregate<{
    _id: string;
    grossKobo: number;
    netKobo: number;
  }>([
    { $match: { createdAt: { $gte: from, $lte: to } } },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
        grossKobo: { $sum: '$grossKobo' },
        netKobo: { $sum: '$sellerNetKobo' },
      },
    },
  ]);

  const byDay = new Map(rows.map((row) => [row._id, row]));
  const points: RevenuePoint[] = [];

  for (let offset = 0; offset < days; offset += 1) {
    const date = new Date(from.getTime() + offset * 24 * 60 * 60 * 1000);
    const key = date.toISOString().slice(0, 10);
    const row = byDay.get(key);

    points.push({
      date,
      label: key,
      // Refunds are negative in the ledger, so a day can net below zero. Clamp
      // only the chart geometry, never the figure the seller reconciles against.
      grossKobo: Math.max(row?.grossKobo ?? 0, 0),
      netKobo: Math.max(row?.netKobo ?? 0, 0),
    });
  }

  return points;
}
