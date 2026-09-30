/**
 * GET /api/sites/:siteId/transactions/export — the seller's ledger as CSV.
 *
 * Walks the cursor rather than loading everything at once, and stops at a hard
 * row cap. An unbounded export of a busy store would hold the whole ledger in
 * memory on a serverless function with a fixed limit.
 */

import type { NextRequest } from 'next/server';
import { requireSession } from '@/lib/http/context';
import { toErrorResponse } from '@/lib/http/respond';
import { assertPermission, requireSiteAccess } from '@/lib/auth/guards';
import { listTransactions, type TransactionRow } from '@/lib/dashboard/seller';
import { withSite } from '@/lib/tenant/loadSite';
import { parseDateRange } from '@/lib/http/query';
import { koboToNairaString, toCsv, type CsvColumn } from '@/lib/export/csv';

export const runtime = 'nodejs';

const MAX_ROWS = 10_000;
const PAGE_SIZE = 200;

interface ExportRow extends Record<string, string | number | null> {
  date: string;
  type: string;
  status: string;
  orderNumber: string | null;
  reference: string | null;
  customerEmail: string | null;
  gross: string;
  providerFee: string;
  platformCommission: string;
  platformCommissionVat: string;
  sellerNet: string;
  memo: string | null;
}

const COLUMNS: CsvColumn<ExportRow>[] = [
  { key: 'date', header: 'Date' },
  { key: 'type', header: 'Type' },
  { key: 'status', header: 'Status' },
  { key: 'orderNumber', header: 'Order' },
  { key: 'reference', header: 'Paystack Reference' },
  { key: 'customerEmail', header: 'Customer' },
  { key: 'gross', header: 'Gross (NGN)' },
  { key: 'providerFee', header: 'Paystack Fee (NGN)' },
  { key: 'platformCommission', header: 'Platform Fee (NGN)' },
  { key: 'platformCommissionVat', header: 'Platform Fee VAT (NGN)' },
  { key: 'sellerNet', header: 'Your Net (NGN)' },
  { key: 'memo', header: 'Note' },
];

function toExportRow(row: TransactionRow): ExportRow {
  return {
    date: row.createdAt.toISOString(),
    type: row.entryType,
    status: row.status,
    orderNumber: row.orderNumber,
    reference: row.reference,
    customerEmail: row.customerEmail,
    gross: koboToNairaString(row.grossKobo),
    providerFee: koboToNairaString(row.providerFeeKobo),
    platformCommission: koboToNairaString(row.platformCommissionKobo),
    platformCommissionVat: koboToNairaString(row.platformCommissionVatKobo),
    sellerNet: koboToNairaString(row.sellerNetKobo),
    memo: row.memo,
  };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ siteId: string }> },
) {
  try {
    const { siteId } = await params;
    const session = await requireSession(request, 'platform');

    const access = await requireSiteAccess(session, siteId, ['owner', 'staff']);
    assertPermission(access, 'orders:read');

    const range = parseDateRange(request.nextUrl.searchParams);

    const rows = await withSite(access.site, async () => {
      const collected: ExportRow[] = [];
      let cursor: string | undefined;

      while (collected.length < MAX_ROWS) {
        const page = await listTransactions({ ...range, cursor, limit: PAGE_SIZE });
        collected.push(...page.rows.map(toExportRow));

        if (!page.hasMore || !page.nextCursor) break;
        cursor = page.nextCursor;
      }

      return collected.slice(0, MAX_ROWS);
    });

    const filename = `hordemart-transactions-${new Date().toISOString().slice(0, 10)}.csv`;

    return new Response(toCsv(COLUMNS, rows), {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'private, no-store',
        // The file contains seller-controlled text; never let a browser decide
        // it looks like HTML and render it.
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
