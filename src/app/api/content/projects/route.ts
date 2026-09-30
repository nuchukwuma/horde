/**
 * GET /api/content/projects — the public portfolio for this tenant's host.
 */

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { requirePublicSite } from '@/lib/http/context';
import { toErrorResponse } from '@/lib/http/respond';
import { withSite } from '@/lib/tenant/loadSite';
import { assertModuleEnabled } from '@/lib/content/modules';
import { listPublishedProjects } from '@/lib/content/projects';
import { parseLimit } from '@/lib/http/query';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const site = await requirePublicSite(request);
    assertModuleEnabled(site, 'portfolio');

    const projects = await withSite(site, () =>
      listPublishedProjects(parseLimit(request.nextUrl.searchParams, 50, 200)),
    );

    return NextResponse.json(
      {
        data: projects.map((project) => ({
          slug: project.slug,
          title: project.title,
          summary: project.summary ?? null,
          images: project.images,
          client: project.client ?? null,
          role: project.role ?? null,
          tags: project.tags,
          completedAt: project.completedAt,
        })),
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
