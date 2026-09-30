/**
 * GET /api/content/posts — the public blog index for whichever tenant's host
 * this request arrived on.
 *
 * No authentication. Drafts are excluded by the service, not by this route, so
 * a future public surface cannot accidentally expose them.
 */

import type { NextRequest } from 'next/server';
import { requirePublicSite } from '@/lib/http/context';
import { toErrorResponse } from '@/lib/http/respond';
import { NextResponse } from 'next/server';
import { withSite } from '@/lib/tenant/loadSite';
import { assertModuleEnabled } from '@/lib/content/modules';
import { listPublishedPosts } from '@/lib/content/posts';
import { parseLimit } from '@/lib/http/query';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const site = await requirePublicSite(request);
    assertModuleEnabled(site, 'blog');

    const search = request.nextUrl.searchParams;
    const posts = await withSite(site, () =>
      listPublishedPosts({
        tag: search.get('tag') ?? undefined,
        limit: parseLimit(search, 20, 100),
        skip: Math.max(Number(search.get('skip') ?? 0) || 0, 0),
      }),
    );

    return NextResponse.json(
      {
        data: posts.map((post) => ({
          slug: post.slug,
          title: post.title,
          excerpt: post.excerpt ?? null,
          coverImage: post.coverImage,
          tags: post.tags,
          publishedAt: post.publishedAt,
          readingMinutes: post.readingMinutes,
        })),
      },
      {
        status: 200,
        headers: {
          // Public content: cacheable, but revalidated so an edit appears
          // within the minute rather than whenever a CDN feels like it.
          'Cache-Control': 'public, max-age=60, stale-while-revalidate=300',
        },
      },
    );
  } catch (error) {
    return toErrorResponse(error);
  }
}
