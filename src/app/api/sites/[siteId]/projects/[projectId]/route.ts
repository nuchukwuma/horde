/**
 * One portfolio project.
 *
 * GET    — read it (any status), for the dashboard editor
 * PATCH  — partial update; HTML sanitised and images checked on write
 * DELETE — archive. Never a hard delete, the same as posts and products.
 *
 * Looked up inside the site's tenant scope: another store's id is not found.
 */

import type { NextRequest } from 'next/server';
import { Types } from 'mongoose';
import { requireSession } from '@/lib/http/context';
import { ok, toErrorResponse } from '@/lib/http/respond';
import { assertPermission, requireSiteAccess } from '@/lib/auth/guards';
import { withSite } from '@/lib/tenant/loadSite';
import { assertModuleEnabled } from '@/lib/content/modules';
import { updateProject } from '@/lib/content/projects';
import { Project } from '@/lib/db/models/Project';
import { updateProjectSchema } from '@/lib/validation/schemas';
import { NotFoundError } from '@/lib/errors';

export const runtime = 'nodejs';

type Params = { params: Promise<{ siteId: string; projectId: string }> };

export async function GET(request: NextRequest, { params }: Params) {
  try {
    const { siteId, projectId } = await params;
    const session = await requireSession(request, 'platform');
    const access = await requireSiteAccess(session, siteId, ['owner', 'staff']);
    assertModuleEnabled(access.site, 'portfolio');
    if (!Types.ObjectId.isValid(projectId)) throw new NotFoundError('Project');

    const project = await withSite(access.site, () => Project.findById(projectId).lean());
    if (!project) throw new NotFoundError('Project');
    return ok(project);
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const { siteId, projectId } = await params;
    const session = await requireSession(request, 'platform');
    const access = await requireSiteAccess(session, siteId, ['owner', 'staff']);
    assertPermission(access, 'content:write');
    assertModuleEnabled(access.site, 'portfolio');

    const body = updateProjectSchema.parse(await request.json());
    const project = await withSite(access.site, () => updateProject(projectId, body));
    return ok(project);
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const { siteId, projectId } = await params;
    const session = await requireSession(request, 'platform');
    const access = await requireSiteAccess(session, siteId, ['owner', 'staff']);
    assertPermission(access, 'content:write');
    assertModuleEnabled(access.site, 'portfolio');

    const project = await withSite(access.site, () => updateProject(projectId, { status: 'archived' }));
    return ok({ id: String(project._id), status: project.status });
  } catch (error) {
    return toErrorResponse(error);
  }
}
