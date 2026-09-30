/**
 * GET /robots.txt — per tenant.
 *
 * A site that cannot take payments yet is told not to index. A half-built
 * storefront ranking for a seller's own brand name, then changing completely,
 * is worse for them than not being indexed for a few days.
 */

import type { NextRequest } from 'next/server';
import { requirePublicSite } from '@/lib/http/context';
import { toErrorResponse } from '@/lib/http/respond';
import { buildRobots } from '@/lib/seo/sitemap';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const site = await requirePublicSite(request);

    // Only gate on payout for a store. A portfolio or blog has nothing to sell
    // and should be indexable from the day it is published.
    const storeOnly = site.modules.store && !site.modules.blog && !site.modules.portfolio;
    const disallowAll = storeOnly && site.payout.status !== 'verified';

    return new Response(buildRobots(site, { disallowAll }), {
      status: 200,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
