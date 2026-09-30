/**
 * Portfolio project authoring and reading.
 *
 * Same shape as posts.ts, and deliberately not abstracted into a shared
 * "content service". The two differ in ordering, publish semantics and fields;
 * a generic layer would be a switch on type wearing a base class.
 */

import { Project, type ProjectAttributes } from '../db/models/Project';
import { sanitizeInline, sanitizeRichText, stripAllHtml } from '../security/sanitizeHtml';
import { slugifyOrFallback, uniqueSlug } from './slug';
import { NotFoundError } from '../errors';

export interface CreateProjectInput {
  title: string;
  slug?: string;
  summary?: string;
  descriptionHtml?: string;
  images?: Array<{
    cloudinaryPublicId: string;
    url: string;
    alt?: string;
    width?: number;
    height?: number;
  }>;
  client?: string;
  role?: string;
  projectUrl?: string;
  completedAt?: string;
  tags?: string[];
  status?: 'draft' | 'published' | 'archived';
  position?: number;
  metaTitle?: string;
  metaDescription?: string;
  noindex?: boolean;
}

export async function createProject(input: CreateProjectInput): Promise<ProjectAttributes> {
  const desired = slugifyOrFallback(input.slug || input.title, 'project');
  const slug = await uniqueSlug(
    desired,
    async (candidate) => (await Project.countDocuments({ slug: candidate })) > 0,
  );

  return Project.create({
    title: sanitizeInline(input.title),
    slug,
    summary: input.summary ? stripAllHtml(input.summary) : undefined,
    descriptionHtml: input.descriptionHtml ? sanitizeRichText(input.descriptionHtml) : undefined,
    images: input.images ?? [],
    client: input.client ? stripAllHtml(input.client) : undefined,
    role: input.role ? stripAllHtml(input.role) : undefined,
    projectUrl: input.projectUrl,
    completedAt: input.completedAt ? new Date(input.completedAt) : null,
    tags: normaliseTags(input.tags),
    status: input.status ?? 'draft',
    publishedAt: input.status === 'published' ? new Date() : null,
    position: input.position ?? 0,
    seo: {
      metaTitle: input.metaTitle ? stripAllHtml(input.metaTitle) : undefined,
      metaDescription: input.metaDescription ? stripAllHtml(input.metaDescription) : undefined,
      noindex: input.noindex ?? false,
    },
  });
}

export async function updateProject(
  projectId: string,
  input: Partial<CreateProjectInput>,
): Promise<ProjectAttributes> {
  const project = await Project.findById(projectId);
  if (!project) throw new NotFoundError('Project');

  const update: Record<string, unknown> = {};

  if (input.title !== undefined) update.title = sanitizeInline(input.title);
  if (input.summary !== undefined) update.summary = stripAllHtml(input.summary);
  if (input.descriptionHtml !== undefined) {
    update.descriptionHtml = sanitizeRichText(input.descriptionHtml);
  }
  if (input.images !== undefined) update.images = input.images;
  if (input.client !== undefined) update.client = stripAllHtml(input.client);
  if (input.role !== undefined) update.role = stripAllHtml(input.role);
  if (input.projectUrl !== undefined) update.projectUrl = input.projectUrl;
  if (input.completedAt !== undefined) update.completedAt = new Date(input.completedAt);
  if (input.tags !== undefined) update.tags = normaliseTags(input.tags);
  if (input.position !== undefined) update.position = input.position;

  if (input.status !== undefined) {
    update.status = input.status;
    if (input.status === 'published' && !project.publishedAt) {
      update.publishedAt = new Date();
    }
  }

  if (input.metaTitle !== undefined) update['seo.metaTitle'] = stripAllHtml(input.metaTitle);
  if (input.metaDescription !== undefined) {
    update['seo.metaDescription'] = stripAllHtml(input.metaDescription);
  }
  if (input.noindex !== undefined) update['seo.noindex'] = input.noindex;

  await Project.updateOne({ _id: project._id }, { $set: update });

  const updated = await Project.findById(project._id);
  if (!updated) throw new NotFoundError('Project');
  return updated;
}

/** Published projects in the seller's chosen order — a portfolio is curated. */
export async function listPublishedProjects(limit = 50) {
  return Project.find({ status: 'published' })
    .sort({ position: 1, publishedAt: -1 })
    .limit(Math.min(Math.max(limit, 1), 200))
    .lean();
}

export async function findPublishedProject(slug: string) {
  return Project.findOne({ slug, status: 'published' }).lean();
}

function normaliseTags(tags?: string[]): string[] {
  if (!tags) return [];
  const cleaned = tags
    .map((tag) => stripAllHtml(tag).trim().toLowerCase())
    .filter((tag) => tag.length > 0 && tag.length <= 40);

  return [...new Set(cleaned)].slice(0, 20);
}
