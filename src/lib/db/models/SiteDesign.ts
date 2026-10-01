/**
 * A store's design: theme tokens and Puck page layout, as a draft and as the
 * published version. Tenant-scoped — one document per site.
 *
 * Draft and published are separate on purpose. The editor only ever writes
 * the draft; the storefront only ever reads `published`. Publishing copies
 * the (already validated) draft across and bumps `version`. A half-finished
 * edit can therefore never reach a customer, and a published store does not
 * change until its owner says so.
 *
 * `revision` is an optimistic-concurrency counter: a save must name the
 * revision it was based on, so two open editor tabs cannot silently
 * overwrite each other.
 *
 * Theme and page are stored as Mixed because their shape is owned by zod
 * (lib/design/theme.ts, lib/design/blocks.ts); every write goes through
 * those schemas in lib/design/service.ts first.
 */

import mongoose, { Schema, type Model, type Types } from 'mongoose';
import type { Timestamps } from './timestamps';
import { tenantScopePlugin } from '../plugins/tenantScope';
import type { Theme } from '../../design/theme';
import type { PageData } from '../../design/blocks';

export interface DesignVersion {
  theme: Theme;
  page: PageData;
}

export interface SiteDesignAttributes extends Timestamps {
  _id: Types.ObjectId;
  siteId: Types.ObjectId;
  draft: DesignVersion & { savedAt: Date; savedBy: Types.ObjectId | null };
  published:
    | (DesignVersion & { publishedAt: Date; publishedBy: Types.ObjectId | null; version: number })
    | null;
  revision: number;
}

const siteDesignSchema = new Schema<SiteDesignAttributes>(
  {
    draft: {
      theme: { type: Schema.Types.Mixed, required: true },
      page: { type: Schema.Types.Mixed, required: true },
      savedAt: { type: Date, required: true },
      savedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    },
    published: {
      type: new Schema(
        {
          theme: { type: Schema.Types.Mixed, required: true },
          page: { type: Schema.Types.Mixed, required: true },
          publishedAt: { type: Date, required: true },
          publishedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
          version: { type: Number, required: true, min: 1 },
        },
        // minimize:false here as well as on the parent: a nested schema has
        // its own setting, and with the default Mongoose strips the page's
        // empty `root: { props: {} }` — which Puck's renderer then trips on.
        { _id: false, minimize: false },
      ),
      default: null,
    },
    revision: { type: Number, required: true, default: 0, min: 0 },
  },
  { timestamps: true, minimize: false },
);

siteDesignSchema.plugin(tenantScopePlugin, { modelName: 'SiteDesign' });

// One design per site: make the plugin's siteId index unique rather than
// declaring a second index on the same key.
siteDesignSchema.path('siteId').index({ unique: true });

export const SiteDesign: Model<SiteDesignAttributes> =
  (mongoose.models.SiteDesign as Model<SiteDesignAttributes>) ??
  mongoose.model<SiteDesignAttributes>('SiteDesign', siteDesignSchema);
