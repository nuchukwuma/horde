/**
 * Store customisation against a real database: tenant isolation on design
 * reads and writes, draft versus published, revision conflicts, and address
 * changes with permanent retirement of the old address.
 *
 * Requires MONGODB_TEST_URI. See tests/helpers/mongo.ts.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { Types } from 'mongoose';
import { Site, type SiteDocument } from '../../src/lib/db/models/Site';
import { SiteDesign } from '../../src/lib/db/models/SiteDesign';
import { SlugHistory } from '../../src/lib/db/models/SlugHistory';
import { runWithoutTenantScope } from '../../src/lib/tenant/context';
import { withSite } from '../../src/lib/tenant/loadSite';
import { loadEditorDesign, publishDesign, readPublishedDesign, saveDraft } from '../../src/lib/design/service';
import { PRESET_THEMES, presetPage } from '../../src/lib/design/presets';
import { changeSiteSlug, findSiteByRetiredSlug } from '../../src/lib/tenant/changeSlug';
import { isSlugAvailable } from '../../src/lib/onboarding/signup';
import { ConflictError, TenantScopeError } from '../../src/lib/errors';
import { hasMongo } from '../helpers/mongo';

const actor = new Types.ObjectId();

async function makeSite(slug: string): Promise<SiteDocument> {
  return runWithoutTenantScope('creating a test Site, which is the tenant root', () =>
    Site.create({ slug, name: `Store ${slug}`, ownerId: new Types.ObjectId() }),
  ) as Promise<SiteDocument>;
}

const draftFor = (site: SiteDocument, preset: 'fashion' | 'food' = 'fashion') => ({
  theme: PRESET_THEMES[preset],
  page: presetPage(preset, site.name),
});

describe.runIf(hasMongo)('store design — tenant isolation', () => {
  let a: SiteDocument;
  let b: SiteDocument;

  beforeEach(async () => {
    a = await makeSite('store-alpha');
    b = await makeSite('store-bravo');
  });

  it('a store reads only its own design', async () => {
    await withSite(a, () => saveDraft(a, { ...draftFor(a, 'food'), revision: 0 }, actor));

    const fromB = await withSite(b, () => loadEditorDesign(b));
    expect(fromB.revision).toBe(0); // B has no design: it gets the default, not A's
    expect(fromB.draft.theme.preset).toBe('fashion');

    expect(await withSite(b, () => SiteDesign.countDocuments({}))).toBe(0);
    expect(await withSite(a, () => SiteDesign.countDocuments({}))).toBe(1);
  });

  it("a store cannot write another store's design, even holding its document id", async () => {
    const saved = await withSite(a, () => saveDraft(a, { ...draftFor(a), revision: 0 }, actor));
    const aDoc = await withSite(a, () => SiteDesign.findOne({}).lean());

    // Inside B's scope, A's _id simply does not match.
    const result = await withSite(b, () =>
      SiteDesign.updateOne({ _id: aDoc!._id }, { $set: { 'draft.theme.preset': 'custom' } }),
    );
    expect(result.matchedCount).toBe(0);

    // And B's save creates B's own document, leaving A's untouched.
    await withSite(b, () => saveDraft(b, { ...draftFor(b, 'food'), revision: 0 }, actor));
    const aAfter = await withSite(a, () => loadEditorDesign(a));
    expect(aAfter.revision).toBe(saved.revision);
    expect(aAfter.draft.theme.preset).toBe('fashion');
  });

  it('refuses a design query with no store in scope', async () => {
    await expect(SiteDesign.findOne({})).rejects.toThrow(TenantScopeError);
  });
});

describe.runIf(hasMongo)('store design — draft versus published', () => {
  let site: SiteDocument;

  beforeEach(async () => {
    site = await makeSite('store-charlie');
  });

  it('customers see nothing until the owner publishes', async () => {
    await withSite(site, () => saveDraft(site, { ...draftFor(site), revision: 0 }, actor));
    expect(await withSite(site, () => readPublishedDesign())).toBeNull();
  });

  it('publishing makes the saved draft live; later drafts stay private until published again', async () => {
    const first = await withSite(site, () => saveDraft(site, { ...draftFor(site, 'fashion'), revision: 0 }, actor));
    await withSite(site, () => publishDesign(site, first.revision, actor, 'owner'));

    const live = await withSite(site, () => readPublishedDesign());
    expect(live?.version).toBe(1);
    expect(live?.theme.preset).toBe('fashion');

    const second = await withSite(site, () => saveDraft(site, { ...draftFor(site, 'food'), revision: first.revision }, actor));
    expect((await withSite(site, () => readPublishedDesign()))?.theme.preset).toBe('fashion');

    await withSite(site, () => publishDesign(site, second.revision, actor, 'owner'));
    const relive = await withSite(site, () => readPublishedDesign());
    expect(relive?.version).toBe(2);
    expect(relive?.theme.preset).toBe('food');
    // The empty root survives the round trip (Puck's renderer needs it).
    expect(relive?.page.root).toEqual({ props: {} });
  });

  it('a save based on a stale revision is refused, not merged', async () => {
    const first = await withSite(site, () => saveDraft(site, { ...draftFor(site), revision: 0 }, actor));
    await withSite(site, () => saveDraft(site, { ...draftFor(site, 'food'), revision: first.revision }, actor));

    await expect(
      withSite(site, () => saveDraft(site, { ...draftFor(site), revision: first.revision }, actor)),
    ).rejects.toThrow(ConflictError);
    await expect(withSite(site, () => publishDesign(site, first.revision, actor, 'owner'))).rejects.toThrow(ConflictError);
  });

  it('a malicious draft is refused before it is stored', async () => {
    const evil = {
      theme: PRESET_THEMES.fashion,
      page: { root: { props: {} }, content: [{ type: 'RawHtml', props: { id: 'x', html: '<script>1</script>' } }] },
      revision: 0,
    };
    await expect(withSite(site, () => saveDraft(site, evil, actor))).rejects.toThrow();
    expect(await withSite(site, () => SiteDesign.countDocuments({}))).toBe(0);
  });
});

describe.runIf(hasMongo)('store address changes', () => {
  it('moves the store, retires the old address for good, and follows it', async () => {
    const site = await makeSite('old-name');

    await changeSiteSlug({ site, slug: 'new-name', actorUserId: actor, actorRole: 'owner' });

    const renamed = await runWithoutTenantScope('reading a test Site', () => Site.findById(site._id));
    expect(renamed?.slug).toBe('new-name');
    expect(await SlugHistory.exists({ slug: 'old-name' })).toBeTruthy();

    // Nobody can take the old address, and it still leads to this store.
    expect(await isSlugAvailable('old-name')).toBe(false);
    expect(String((await findSiteByRetiredSlug('old-name'))?._id)).toBe(String(site._id));
  });

  it("refuses a reserved name and another store's address", async () => {
    const site = await makeSite('mine-here');
    await makeSite('taken-name');

    await expect(changeSiteSlug({ site, slug: 'admin', actorUserId: actor, actorRole: 'owner' })).rejects.toThrow();
    await expect(changeSiteSlug({ site, slug: 'taken-name', actorUserId: actor, actorRole: 'owner' })).rejects.toThrow(ConflictError);
  });
});

describe.runIf(hasMongo)('stores without a custom domain', () => {
  it('can all exist at once (the old sparse+null index allowed only one)', async () => {
    await makeSite('first-store');
    await makeSite('second-store');
    await makeSite('third-store');
    expect(await runWithoutTenantScope('counting test Sites', () => Site.countDocuments({}))).toBe(3);
  });
});
