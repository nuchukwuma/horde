/**
 * GET /api/sites/:siteId/transactions — the seller's ledger, newest first.
 *
 * Cursor-paginated. See lib/dashboard/seller.ts for why offset would be wrong
 * for a list of money.
 */

import type { NextRequest } from 'next/server';
import { requireSession } from '@/lib/http/context';
import { paginated, toErrorResponse } from '@/lib/http/respond';
import { assertPermission, requireSiteAccess } from '@/lib/auth/guards';
import { listTransactions } from '@/lib/dashboard/seller';
import { withSite } from '@/lib/tenant/loadSite';
import { parseDateRange, parseLimit } from '@/lib/http/query';
import type { LedgerEntryType } from '@/lib/db/models/LedgerEntry';

export const runtime = 'nodejs';

const ENTRY_TYPES = [
  'sale',
  'refund',
  'reversal',
  'adjustment',
  'settlement',
  'chargeback',
  'fee',
] as const;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ siteId: string }> },
) {
  try {
    const { siteId } = await params;
    const session = await requireSession(request, 'platform');

    const access = await requireSiteAccess(session, siteId, ['owner', 'staff']);
    assertPermission(access, 'orders:read');

    const search = request.nextUrl.searchParams;
    const requestedType = search.get('entryType');
    const entryType = ENTRY_TYPES.includes(requestedType as LedgerEntryType)
      ? (requestedType as LedgerEntryType)
      : undefined;

    const page = await withSite(access.site, () =>
      listTransactions({
        ...parseDateRange(search),
        entryType,
        cursor: search.get('cursor') ?? undefined,
        limit: parseLimit(search),
      }),
    );

    return paginated(page.rows, { hasMore: page.hasMore, nextCursor: page.nextCursor });
  } catch (error) {
    return toErrorResponse(error);
  }
}
