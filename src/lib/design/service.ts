/**
 * Store design: save a draft, publish it, read what is live.
 *
 * Every function runs inside the caller's tenant scope (withSite). None names
 * a siteId in a query — the tenant plugin adds it — so a session for store A
 * cannot read or write store B's design even with B's document id in hand:
 * the query simply does not match. The siteId itself comes from the URL and
 * is authorised against the signed-in seller's memberships by the route
 * (requireSiteAccess); it is never read from a request body.
 *
 * Validation happens on every write, server-side, before anything is stored:
 * theme through themeSchema (including the contrast floor), page through
 * parsePageData (allow-listed blocks, strict props, sanitised rich text,
 * size cap), images through the same-cloud-same-folder ownership check.
 */

import type { Types } from 'mongoose';
import { SiteDesign, type SiteDesignAttributes } from '../db/models/SiteDesign';
import type { SiteDocument } from '../db/models/Site';
import { ConflictError, NotFoundError } from '../errors';
import { requireTenantId } from '../tenant/context';
import { assertOwnImages, cloudinaryConfig, type CloudinaryConfig } from '../products/images';
import { recordAudit } from '../audit';
import { themeSchema, type Theme } from './theme';
import { pageImages, parsePageData, type PageData } from './blocks';
import { PRESET_THEMES, presetPage } from './presets';

export interface EditorDesign {
  draft: { theme: Theme; page: PageData };
  published: { version: number; publishedAt: string } | null;
  revision: number;
  hasUnpublishedChanges: boolean;
}

export interface DraftInput {
  theme: unknown;
  page: unknown;
  /** The revision the editor loaded; a save based on a stale one is refused. */
  revision: number;
}

/** A new store starts from the fashion preset with its own name in it. */
export function defaultDesign(site: Pick<SiteDocument, 'name'>): { theme: Theme; page: PageData } {
  return { theme: PRESET_THEMES.fashion, page: presetPage('fashion', site.name) };
}

/** Validate a draft completely, or throw. Pure apart from config lookup. */
export function validateDraft(
  input: { theme: unknown; page: unknown },
  siteId: string,
  config: CloudinaryConfig | null = cloudinaryConfig(),
): { theme: Theme; page: PageData } {
  const theme = themeSchema.parse(input.theme);
  const page = parsePageData(input.page);

  const images = [...pageImages(page), ...(theme.logo ? [theme.logo] : [])];
  // Throws unless every image is on our cloud, in this store's design folder.
  assertOwnImages(images, siteId, 'design', config);

  return { theme, page };
}

/**
 * Promote a draft to published. Pure, so the draft/published rule can be
 * tested without a database: the result is a copy of the draft, never a
 * reference to it, and the version only ever goes up.
 */
export function promoteDraft(
  draft: { theme: Theme; page: PageData },
  previous: { version: number } | null,
  actor: Types.ObjectId | null,
  now = new Date(),
) {
  return {
    theme: structuredClone(draft.theme),
    page: structuredClone(draft.page),
    publishedAt: now,
    publishedBy: actor,
    version: (previous?.version ?? 0) + 1,
  };
}

function toEditor(doc: SiteDesignAttributes | null, site: SiteDocument): EditorDesign {
  if (!doc) {
    return { draft: defaultDesign(site), published: null, revision: 0, hasUnpublishedChanges: true };
  }
  const published = doc.published
    ? { version: doc.published.version, publishedAt: new Date(doc.published.publishedAt).toISOString() }
    : null;
  const changed =
    !doc.published ||
    JSON.stringify({ t: doc.draft.theme, p: doc.draft.page }) !==
      JSON.stringify({ t: doc.published.theme, p: doc.published.page });
  return {
    draft: { theme: doc.draft.theme, page: normalisePage(doc.draft.page) },
    published,
    revision: doc.revision,
    hasUnpublishedChanges: changed,
  };
}

/** Puck needs `root` and `content` present even when empty. */
export function normalisePage(page: Partial<PageData> | null | undefined): PageData {
  return {
    root: { props: page?.root?.props ?? {} },
    content: Array.isArray(page?.content) ? page.content : [],
  } as PageData;
}

export async function loadEditorDesign(site: SiteDocument): Promise<EditorDesign> {
  const doc = await SiteDesign.findOne({}).lean();
  return toEditor(doc as SiteDesignAttributes | null, site);
}

export async function saveDraft(
  site: SiteDocument,
  input: DraftInput,
  actor: Types.ObjectId,
): Promise<EditorDesign> {
  const siteId = requireTenantId('SiteDesign');
  const draft = { ...validateDraft(input, siteId), savedAt: new Date(), savedBy: actor };

  let doc: SiteDesignAttributes | null;
  if (input.revision === 0) {
    const existing = await SiteDesign.exists({});
    if (existing) throw new ConflictError('This design was changed in another tab. Reload to see the latest.');
    try {
      doc = (await SiteDesign.create({ draft, published: null, revision: 1 })).toObject() as SiteDesignAttributes;
    } catch (error) {
      if ((error as { code?: number }).code === 11000) {
        throw new ConflictError('This design was changed in another tab. Reload to see the latest.');
      }
      throw error;
    }
  } else {
    doc = (await SiteDesign.findOneAndUpdate(
      { revision: input.revision },
      { $set: { draft }, $inc: { revision: 1 } },
      { new: true },
    ).lean()) as SiteDesignAttributes | null;
    if (!doc) throw new ConflictError('This design was changed in another tab. Reload to see the latest.');
  }

  return toEditor(doc, site);
}

export async function publishDesign(
  site: SiteDocument,
  revision: number,
  actor: Types.ObjectId,
  actorRole: string,
): Promise<EditorDesign> {
  const siteId = requireTenantId('SiteDesign');
  const doc = (await SiteDesign.findOne({}).lean()) as SiteDesignAttributes | null;
  if (!doc) throw new NotFoundError('Saved design');
  // Publish exactly what the seller was looking at, not something another
  // tab saved a second ago.
  if (doc.revision !== revision) {
    throw new ConflictError('This design was changed in another tab. Reload before publishing.');
  }

  // Re-validated on the way out as well as on the way in: a stored draft that
  // predates a tightened rule must not reach customers.
  const valid = validateDraft({ theme: doc.draft.theme, page: normalisePage(doc.draft.page) }, siteId);
  const published = promoteDraft(valid, doc.published, actor);

  const updated = (await SiteDesign.findOneAndUpdate(
    { revision },
    { $set: { published } },
    { new: true },
  ).lean()) as SiteDesignAttributes | null;
  if (!updated) throw new ConflictError('This design was changed in another tab. Reload before publishing.');

  await recordAudit({
    action: 'site.design.published',
    siteId: site._id,
    actorUserId: actor,
    actorRole,
    targetType: 'SiteDesign',
    targetId: String(updated._id),
    after: { version: published.version },
  });

  return toEditor(updated, site);
}

/** What a storefront renders. Only ever the published version. */
export async function readPublishedDesign(): Promise<{ theme: Theme; page: PageData; version: number } | null> {
  const doc = (await SiteDesign.findOne({}).select('published').lean()) as Pick<SiteDesignAttributes, 'published'> | null;
  if (!doc?.published) return null;
  return { theme: doc.published.theme, page: normalisePage(doc.published.page), version: doc.published.version };
}
