/**
 * Blog post. Tenant-scoped.
 *
 * `contentHtml` is sanitised at write time by the route, never at render. A
 * post is read far more often than it is written, and render-time sanitisation
 * has to be remembered at every call site — including the sitemap, the RSS feed
 * and whatever gets built next.
 */

import mongoose, { Schema, type Model, type Types } from 'mongoose';
import type { Timestamps } from './timestamps';
import { tenantScopePlugin } from '../plugins/tenantScope';

export type PublishStatus = 'draft' | 'published' | 'archived';

/** Shared by Post and Project: what search engines read. */
export interface SeoFields {
  metaTitle?: string;
  metaDescription?: string;
  /** Excluded from sitemap and marked noindex when true. */
  noindex: boolean;
}

export interface PostAttributes extends Timestamps {
  _id: Types.ObjectId;
  siteId: Types.ObjectId;
  title: string;
  slug: string;
  excerpt?: string;
  contentHtml: string;
  coverImage?: {
    cloudinaryPublicId: string;
    url: string;
    alt?: string;
  } | null;
  tags: string[];
  status: PublishStatus;
  /** Set when first published; drives ordering and the sitemap's lastmod. */
  publishedAt?: Date | null;
  authorId?: Types.ObjectId | null;
  seo: SeoFields;
  /** Denormalised for list views so a feed does not re-parse every body. */
  readingMinutes: number;
}

export const seoSchemaFields = {
  metaTitle: { type: String, trim: true, maxlength: 200 },
  metaDescription: { type: String, trim: true, maxlength: 400 },
  noindex: { type: Boolean, default: false },
};

const postSchema = new Schema<PostAttributes>(
  {
    title: { type: String, required: true, trim: true, maxlength: 250 },
    slug: { type: String, required: true, lowercase: true, trim: true, maxlength: 250 },
    excerpt: { type: String, trim: true, maxlength: 500 },
    contentHtml: { type: String, required: true, maxlength: 200_000 },
    coverImage: {
      type: {
        _id: false,
        cloudinaryPublicId: { type: String, required: true },
        url: { type: String, required: true },
        alt: { type: String, maxlength: 300 },
      },
      default: null,
    },
    tags: { type: [String], default: [] },
    status: {
      type: String,
      required: true,
      enum: ['draft', 'published', 'archived'],
      default: 'draft',
      index: true,
    },
    publishedAt: { type: Date, default: null },
    authorId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    seo: seoSchemaFields,
    readingMinutes: { type: Number, default: 1, min: 1 },
  },
  { timestamps: true },
);

postSchema.plugin(tenantScopePlugin, { modelName: 'Post' });

postSchema.index({ siteId: 1, slug: 1 }, { unique: true });
// The public blog index: published posts, newest first.
postSchema.index({ siteId: 1, status: 1, publishedAt: -1 });
postSchema.index({ siteId: 1, tags: 1 });

export const Post: Model<PostAttributes> =
  (mongoose.models.Post as Model<PostAttributes>) ??
  mongoose.model<PostAttributes>('Post', postSchema);
