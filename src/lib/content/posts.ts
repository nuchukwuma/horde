/**
 * Blog post authoring and reading.
 *
 * Sanitisation happens here, on write, once. Nothing downstream re-sanitises,
 * so nothing downstream can forget to.
 */

import type { Types } from 'mongoose';
import { Post, type PostAttributes } from '../db/models/Post';
import { sanitizeInline, sanitizeRichText, stripAllHtml } from '../security/sanitizeHtml';
import { estimateReadingMinutes, slugifyOrFallback, uniqueSlug } from './slug';
import { NotFoundError } from '../errors';

export interface CreatePostInput {
  title: string;
  slug?: string;
  excerpt?: string;
  contentHtml: string;
  tags?: string[];
  status?: 'draft' | 'published' | 'archived';
  coverImage?: { cloudinaryPublicId: string; url: string; alt?: string } | null;
  metaTitle?: string;
  metaDescription?: string;
  noindex?: boolean;
  authorId?: Types.ObjectId | null;
}

export async function createPost(input: CreatePostInput): Promise<PostAttributes> {
  const contentHtml = sanitizeRichText(input.contentHtml);

  const desired = slugifyOrFallback(input.slug || input.title, 'post');
  const slug = await uniqueSlug(desired, async (candidate) => {
    return (await Post.countDocuments({ slug: candidate })) > 0;
  });

  return Post.create({
    title: sanitizeInline(input.title),
    slug,
    // An excerpt is rendered as plain text in lists and meta tags, so it has no
    // business carrying markup at all.
    excerpt: input.excerpt ? stripAllHtml(input.excerpt) : undefined,
    contentHtml,
    tags: normaliseTags(input.tags),
    status: input.status ?? 'draft',
    publishedAt: input.status === 'published' ? new Date() : null,
    coverImage: input.coverImage ?? null,
    authorId: input.authorId ?? null,
    seo: {
      metaTitle: input.metaTitle ? stripAllHtml(input.metaTitle) : undefined,
      metaDescription: input.metaDescription ? stripAllHtml(input.metaDescription) : undefined,
      noindex: input.noindex ?? false,
    },
    readingMinutes: estimateReadingMinutes(contentHtml),
  });
}

export type UpdatePostInput = Partial<CreatePostInput>;

export async function updatePost(
  postId: string,
  input: UpdatePostInput,
): Promise<PostAttributes> {
  const post = await Post.findById(postId);
  if (!post) throw new NotFoundError('Post');

  const update: Record<string, unknown> = {};

  if (input.title !== undefined) update.title = sanitizeInline(input.title);
  if (input.excerpt !== undefined) update.excerpt = stripAllHtml(input.excerpt);
  if (input.tags !== undefined) update.tags = normaliseTags(input.tags);
  if (input.coverImage !== undefined) update.coverImage = input.coverImage;

  if (input.contentHtml !== undefined) {
    const contentHtml = sanitizeRichText(input.contentHtml);
    update.contentHtml = contentHtml;
    update.readingMinutes = estimateReadingMinutes(contentHtml);
  }

  if (input.status !== undefined) {
    update.status = input.status;
    // Stamp publishedAt on the FIRST publish only. Re-publishing an edited post
    // should not move it to the top of the blog as though it were new.
    if (input.status === 'published' && !post.publishedAt) {
      update.publishedAt = new Date();
    }
  }

  if (input.metaTitle !== undefined) update['seo.metaTitle'] = stripAllHtml(input.metaTitle);
  if (input.metaDescription !== undefined) {
    update['seo.metaDescription'] = stripAllHtml(input.metaDescription);
  }
  if (input.noindex !== undefined) update['seo.noindex'] = input.noindex;

  await Post.updateOne({ _id: post._id }, { $set: update });

  const updated = await Post.findById(post._id);
  if (!updated) throw new NotFoundError('Post');
  return updated;
}

export interface PublicPostQuery {
  tag?: string;
  limit?: number;
  skip?: number;
}

/**
 * Published posts for the public blog, newest first.
 *
 * Drafts are excluded here rather than at the route, so a new public surface
 * cannot accidentally expose them.
 */
export async function listPublishedPosts(query: PublicPostQuery = {}) {
  const filter: Record<string, unknown> = { status: 'published' };
  if (query.tag) filter.tags = query.tag;

  return Post.find(filter)
    .sort({ publishedAt: -1 })
    .skip(Math.max(query.skip ?? 0, 0))
    .limit(Math.min(Math.max(query.limit ?? 20, 1), 100))
    .lean();
}

export async function findPublishedPost(slug: string) {
  return Post.findOne({ slug, status: 'published' }).lean();
}

/** Lowercase, de-duplicated, capped. Tags become URLs and facets. */
function normaliseTags(tags?: string[]): string[] {
  if (!tags) return [];
  const cleaned = tags
    .map((tag) => stripAllHtml(tag).trim().toLowerCase())
    .filter((tag) => tag.length > 0 && tag.length <= 40);

  return [...new Set(cleaned)].slice(0, 20);
}
