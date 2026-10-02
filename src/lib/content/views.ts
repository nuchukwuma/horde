/**
 * Posts and projects as plain objects a client component can receive: string
 * ids and dates, only the fields the editor shows.
 */

import type { PostAttributes } from '../db/models/Post';
import type { ProjectAttributes } from '../db/models/Project';

const iso = (value: Date | null | undefined) => (value ? new Date(value).toISOString() : null);

function image(entry: { cloudinaryPublicId?: string; url: string; alt?: string; width?: number; height?: number }) {
  return {
    cloudinaryPublicId: entry.cloudinaryPublicId ?? '',
    url: entry.url,
    alt: entry.alt ?? '',
    ...(entry.width ? { width: entry.width } : {}),
    ...(entry.height ? { height: entry.height } : {}),
  };
}

export function toPostEditorView(post: PostAttributes) {
  return {
    id: String(post._id),
    title: post.title,
    slug: post.slug,
    excerpt: post.excerpt ?? '',
    contentHtml: post.contentHtml ?? '',
    coverImage: post.coverImage?.url ? image(post.coverImage) : null,
    tags: post.tags ?? [],
    status: post.status,
    publishedAt: iso(post.publishedAt),
    updatedAt: iso(post.updatedAt),
  };
}

export function toProjectEditorView(project: ProjectAttributes) {
  return {
    id: String(project._id),
    title: project.title,
    slug: project.slug,
    summary: project.summary ?? '',
    descriptionHtml: project.descriptionHtml ?? '',
    images: (project.images ?? []).map(image),
    client: project.client ?? '',
    role: project.role ?? '',
    projectUrl: project.projectUrl ?? '',
    tags: project.tags ?? [],
    status: project.status,
    publishedAt: iso(project.publishedAt),
    updatedAt: iso(project.updatedAt),
  };
}
