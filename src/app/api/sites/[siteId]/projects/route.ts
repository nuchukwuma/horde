/**
 * Portfolio project authoring.
 */

import type { NextRequest } from 'next/server';
import { requireSession } from '@/lib/http/context';
import { created, ok, toErrorResponse } from '@/lib/http/respond';
import { assertPermission, requireSiteAccess } from '@/lib/auth/guards';
import { withSite } from '@/lib/tenant/loadSite';
import { assertModuleAllowedByPlan, assertModuleEnabled } from '@/lib/content/modules';
import { createProject } from '@/lib/content/projects';
import { Project } from '@/lib/db/models/Project';
import { createProjectSchema } from '@/lib/validation/schemas';
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
    assertModuleEnabled(access.site, 'portfolio');

    const projects = await withSite(access.site, () =>
      Project.find({})
        .sort({ position: 1, createdAt: -1 })
        .limit(parseLimit(request.nextUrl.searchParams, 50, 200))
        .lean(),
    );

    return ok(projects);
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
    assertModuleEnabled(access.site, 'portfolio');
    await assertModuleAllowedByPlan(access.site, 'portfolio');

    const body = createProjectSchema.parse(await request.json());
    const project = await withSite(access.site, () => createProject(body));

    return created(project, `/api/sites/${siteId}/projects/${project._id}`);
  } catch (error) {
    return toErrorResponse(error);
  }
}
