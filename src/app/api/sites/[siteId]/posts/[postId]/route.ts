/**
 * A single blog post: read, update, archive.
 *
 * There is no hard delete. Archiving keeps the slug reserved so an old URL does
 * not later resolve to unrelated content, which is both an SEO and a trust
 * problem.
 */

import type { NextRequest } from 'next/server';
import { Types } from 'mongoose';
import { requireSession } from '@/lib/http/context';
import { ok, toErrorResponse } from '@/lib/http/respond';
import { assertPermission, requireSiteAccess } from '@/lib/auth/guards';
import { withSite } from '@/lib/tenant/loadSite';
import { assertModuleEnabled } from '@/lib/content/modules';
import { updatePost } from '@/lib/content/posts';
import { Post } from '@/lib/db/models/Post';
import { updatePostSchema } from '@/lib/validation/schemas';
import { NotFoundError } from '@/lib/errors';

export const runtime = 'nodejs';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ siteId: string; postId: string }> },
) {
  try {
    const { siteId, postId } = await params;
    const session = await requireSession(request, 'platform');
    const access = await requireSiteAccess(session, siteId, ['owner', 'staff']);
    assertModuleEnabled(access.site, 'blog');

    if (!Types.ObjectId.isValid(postId)) throw new NotFoundError('Post');
    const post = await withSite(access.site, () => Post.findById(postId).lean());
    if (!post) throw new NotFoundError('Post');

    return ok(post);
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ siteId: string; postId: string }> },
) {
  try {
    const { siteId, postId } = await params;
    const session = await requireSession(request, 'platform');

    const access = await requireSiteAccess(session, siteId, ['owner', 'staff']);
    assertPermission(access, 'content:write');
    assertModuleEnabled(access.site, 'blog');

    const body = updatePostSchema.parse(await request.json());
    const post = await withSite(access.site, () => updatePost(postId, body));

    return ok(post);
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ siteId: string; postId: string }> },
) {
  try {
    const { siteId, postId } = await params;
    const session = await requireSession(request, 'platform');

    const access = await requireSiteAccess(session, siteId, ['owner', 'staff']);
    assertPermission(access, 'content:write');
    assertModuleEnabled(access.site, 'blog');

    // Archive, not delete — see the module comment.
    const post = await withSite(access.site, () => updatePost(postId, { status: 'archived' }));

    return ok({ id: String(post._id), status: post.status });
  } catch (error) {
    return toErrorResponse(error);
  }
}
