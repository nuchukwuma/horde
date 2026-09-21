/**
 * GET /api/content/posts/:slug — one published post, with its SEO metadata and
 * structured data ready for the page to render.
 */

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { requirePublicSite } from '@/lib/http/context';
import { toErrorResponse } from '@/lib/http/respond';
import { withSite } from '@/lib/tenant/loadSite';
import { assertModuleEnabled } from '@/lib/content/modules';
import { findPublishedPost } from '@/lib/content/posts';
import { buildPageMeta } from '@/lib/seo/meta';
import { blogPostingJsonLd, breadcrumbJsonLd } from '@/lib/seo/jsonLd';
import { NotFoundError } from '@/lib/errors';

export const runtime = 'nodejs';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params;
    const site = await requirePublicSite(request);
    assertModuleEnabled(site, 'blog');

    const post = await withSite(site, () => findPublishedPost(slug));
    if (!post) throw new NotFoundError('Post');

    const path = `/blog/${post.slug}`;

    const meta = buildPageMeta({
      site,
      path,
      title: post.seo?.metaTitle || post.title,
      description: post.seo?.metaDescription,
      fallbackDescription: post.excerpt,
      imageUrl: post.coverImage?.url,
      noindex: post.seo?.noindex,
    });

    return NextResponse.json(
      {
        data: {
          slug: post.slug,
          title: post.title,
          // Already sanitised at write time; safe to render.
          contentHtml: post.contentHtml,
          excerpt: post.excerpt ?? null,
          coverImage: post.coverImage,
          tags: post.tags,
          publishedAt: post.publishedAt,
          updatedAt: post.updatedAt,
          readingMinutes: post.readingMinutes,
        },
        meta,
        jsonLd: [
          blogPostingJsonLd({
            site,
            path,
            headline: post.title,
            description: meta.description,
            imageUrl: post.coverImage?.url,
            publishedAt: post.publishedAt,
            modifiedAt: post.updatedAt,
          }),
          breadcrumbJsonLd(site, [
            { name: site.name, path: '/' },
            { name: 'Blog', path: '/blog' },
            { name: post.title, path },
          ]),
        ],
      },
      {
        status: 200,
        headers: { 'Cache-Control': 'public, max-age=60, stale-while-revalidate=300' },
      },
    );
  } catch (error) {
    return toErrorResponse(error);
  }
}
