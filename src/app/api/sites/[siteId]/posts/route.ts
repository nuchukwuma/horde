/**
 * Blog post authoring.
 *
 * GET  — every post including drafts (this is the seller's own dashboard)
 * POST — create; content is sanitised on write by the service
 */

import type { NextRequest } from 'next/server';
import { requireSession } from '@/lib/http/context';
import { created, ok, toErrorResponse } from '@/lib/http/respond';
import { assertPermission, requireSiteAccess } from '@/lib/auth/guards';
import { withSite } from '@/lib/tenant/loadSite';
import { assertQuota } from '@/lib/billing/quota';
import { assertModuleAllowedByPlan, assertModuleEnabled } from '@/lib/content/modules';
import { createPost } from '@/lib/content/posts';
import { Post } from '@/lib/db/models/Post';
import { createPostSchema } from '@/lib/validation/schemas';
import { parseLimit } from '@/lib/http/query';

export const runtime = 'nodejs';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ siteId: string }> },
) {
  try {
    const { siteId } = await params;
    const session = await requireSession(request, 'platform');
    const access = await requireSiteAccess(session, siteId, ['owner', 'staff']);
    assertModuleEnabled(access.site, 'blog');

    const limit = parseLimit(request.nextUrl.searchParams, 50, 100);

    const posts = await withSite(access.site, () =>
      Post.find({}).sort({ createdAt: -1 }).limit(limit).lean(),
    );

    return ok(posts);
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ siteId: string }> },
) {
  try {
    const { siteId } = await params;
    const session = await requireSession(request, 'platform');

    const access = await requireSiteAccess(session, siteId, ['owner', 'staff']);
    assertPermission(access, 'content:write');
    assertModuleEnabled(access.site, 'blog');
    await assertModuleAllowedByPlan(access.site, 'blog');

    const body = createPostSchema.parse(await request.json());

    const post = await withSite(access.site, async () => {
      await assertQuota(access.site, 'posts');
      return createPost({ ...body, authorId: session.user._id });
    });

    return created(post, `/api/sites/${siteId}/posts/${post._id}`);
  } catch (error) {
    return toErrorResponse(error);
  }
}
