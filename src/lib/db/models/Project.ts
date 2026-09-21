/**
 * Portfolio project. Tenant-scoped.
 *
 * Deliberately a separate model from Post rather than a `type` discriminator on
 * one. They are read differently (a portfolio is curated and ordered by hand; a
 * blog is chronological), and the shared fields are few enough that merging
 * them would mean a document where half the columns are always null.
 */

import mongoose, { Schema, type Model, type Types } from 'mongoose';
import type { Timestamps } from './timestamps';
import { tenantScopePlugin } from '../plugins/tenantScope';
import { seoSchemaFields, type PublishStatus, type SeoFields } from './Post';

export interface ProjectAttributes extends Timestamps {
  _id: Types.ObjectId;
  siteId: Types.ObjectId;
  title: string;
  slug: string;
  summary?: string;
  /** Sanitised at write time, like Post.contentHtml. */
  descriptionHtml?: string;
  images: Array<{
    cloudinaryPublicId: string;
    url: string;
    alt?: string;
    width?: number;
    height?: number;
  }>;
  client?: string;
  role?: string;
  /** External link to the live work. Validated as http(s) at the boundary. */
  projectUrl?: string;
  completedAt?: Date | null;
  tags: string[];
  status: PublishStatus;
  publishedAt?: Date | null;
  /** Manual ordering — a portfolio is curated, not chronological. */
  position: number;
  seo: SeoFields;
}

const projectSchema = new Schema<ProjectAttributes>(
  {
    title: { type: String, required: true, trim: true, maxlength: 250 },
    slug: { type: String, required: true, lowercase: true, trim: true, maxlength: 250 },
    summary: { type: String, trim: true, maxlength: 500 },
    descriptionHtml: { type: String, maxlength: 100_000 },
    images: {
      type: [
        {
          _id: false,
          cloudinaryPublicId: { type: String, required: true },
          url: { type: String, required: true },
          alt: { type: String, maxlength: 300 },
          width: Number,
          height: Number,
        },
      ],
      default: [],
    },
    client: { type: String, trim: true, maxlength: 200 },
    role: { type: String, trim: true, maxlength: 200 },
    projectUrl: { type: String, trim: true, maxlength: 2_000 },
    completedAt: { type: Date, default: null },
    tags: { type: [String], default: [] },
    status: {
      type: String,
      required: true,
      enum: ['draft', 'published', 'archived'],
      default: 'draft',
      index: true,
    },
    publishedAt: { type: Date, default: null },
    position: { type: Number, default: 0 },
    seo: seoSchemaFields,
  },
  { timestamps: true },
);

projectSchema.plugin(tenantScopePlugin, { modelName: 'Project' });

projectSchema.index({ siteId: 1, slug: 1 }, { unique: true });
projectSchema.index({ siteId: 1, status: 1, position: 1 });

export const Project: Model<ProjectAttributes> =
  (mongoose.models.Project as Model<ProjectAttributes>) ??
  mongoose.model<ProjectAttributes>('Project', projectSchema);
