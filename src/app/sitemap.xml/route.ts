/**
 * GET /sitemap.xml — one sitemap per tenant, served from that tenant's host.
 *
 * Deliberately not a platform-wide sitemap: that would publish the complete
 * list of sellers to anyone who fetched it, and search engines largely ignore
 * entries for hosts other than the one serving the file.
 */

import type { NextRequest } from 'next/server';
import { requirePublicSite } from '@/lib/http/context';
import { toErrorResponse } from '@/lib/http/respond';
import { withSite } from '@/lib/tenant/loadSite';
import { buildSitemap, type SitemapEntry } from '@/lib/seo/sitemap';
import { Post } from '@/lib/db/models/Post';
import { Project } from '@/lib/db/models/Project';
import { Product } from '@/lib/db/models/Product';

export const runtime = 'nodejs';

const MAX_PER_TYPE = 5_000;

export async function GET(request: NextRequest) {
  try {
    const site = await requirePublicSite(request);

    const entries: SitemapEntry[] = [
      { path: '/', changeFrequency: 'weekly', priority: 1 },
    ];

    await withSite(site, async () => {
      if (site.modules.blog) {
        entries.push({ path: '/blog', changeFrequency: 'daily', priority: 0.8 });

        // noindex pages are excluded: listing a page in a sitemap while telling
        // crawlers not to index it is a contradictory signal.
        const posts = await Post.find({ status: 'published', 'seo.noindex': { $ne: true } })
          .select('slug publishedAt updatedAt')
          .sort({ publishedAt: -1 })
          .limit(MAX_PER_TYPE)
          .lean();

        for (const post of posts) {
          entries.push({
            path: `/blog/${post.slug}`,
            lastModified: post.updatedAt ?? post.publishedAt,
            changeFrequency: 'monthly',
            priority: 0.6,
          });
        }
      }

      if (site.modules.portfolio) {
        entries.push({ path: '/work', changeFrequency: 'weekly', priority: 0.8 });

        const projects = await Project.find({
          status: 'published',
          'seo.noindex': { $ne: true },
        })
          .select('slug updatedAt')
          .sort({ position: 1 })
          .limit(MAX_PER_TYPE)
          .lean();

        for (const project of projects) {
          entries.push({
            path: `/work/${project.slug}`,
            lastModified: project.updatedAt,
            changeFrequency: 'monthly',
            priority: 0.6,
          });
        }
      }

      if (site.modules.store) {
        entries.push({ path: '/shop', changeFrequency: 'daily', priority: 0.9 });

        const products = await Product.find({ status: 'active' })
          .select('slug updatedAt')
          .sort({ updatedAt: -1 })
          .limit(MAX_PER_TYPE)
          .lean();

        for (const product of products) {
          entries.push({
            path: `/shop/${product.slug}`,
            lastModified: product.updatedAt,
            changeFrequency: 'weekly',
            priority: 0.7,
          });
        }
      }
    });

    return new Response(buildSitemap(site, entries), {
      status: 200,
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
