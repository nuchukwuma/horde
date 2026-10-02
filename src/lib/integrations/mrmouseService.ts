/**
 * What HordeMart does with a MrMouse connection: record the owner's consent,
 * mint sign-in passes, take stock levels in, and send sales out. The wire
 * formats live in ./mrmouse.ts; the contract in docs/integrations/mrmouse.md.
 */

import type { Types } from 'mongoose';
import { Site, type SiteDocument } from '../db/models/Site';
import { Product } from '../db/models/Product';
import type { OrderAttributes } from '../db/models/Order';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../errors';
import { MRMOUSE_TERMS_VERSION } from '../legal/terms';
import { recordAudit } from '../audit';
import { runWithoutTenantScope, runWithTenant } from '../tenant/context';
import { siteOrigin } from '../seo/meta';
import type { AuthenticatedSession } from '../auth/session';
import { canLaunch, canSync, launchUrl, mrmouseConfig, signHandoffToken, type MrMouseConfig } from './mrmouse';
import { queueMrMouseSale, salesMrMouseHasNotCounted } from './mrmouseSales';

/**
 * Connected means: the owner agreed, to the *current* connection terms. When
 * MRMOUSE_TERMS_VERSION changes, sign-in and stock sync pause until the owner
 * accepts again (`termsOutdated`).
 */
export function mrmouseState(site: Pick<SiteDocument, 'integrations'>) {
  const state = site.integrations?.mrmouse;
  const agreed = Boolean(state?.connectedAt);
  const current = state?.termsVersion === MRMOUSE_TERMS_VERSION;
  return {
    connected: agreed && current,
    termsOutdated: agreed && !current,
    connectedAt: state?.connectedAt ?? null,
    stockSync: Boolean(agreed && current && state?.stockSync),
  };
}

export interface ConnectionChange {
  connect?: boolean;
  /** Required with connect: true — the owner ticked the connection terms. */
  acceptTerms?: boolean;
  stockSync?: boolean;
}

/**
 * Connect, disconnect, or switch stock sync. Owner only — this is a decision
 * to share the store's data with another service — enforced by the route.
 */
export async function changeMrMouseConnection(
  siteId: Types.ObjectId | string,
  change: ConnectionChange,
  actor: { userId: Types.ObjectId; ip?: string; userAgent?: string },
  config: MrMouseConfig = mrmouseConfig(),
) {
  return runWithoutTenantScope('updating a Site, which is the tenant root and therefore not tenant-scoped', async () => {
    const site = await Site.findById(siteId);
    if (!site) throw new NotFoundError('Site');
    const before = mrmouseState(site);
    const audit = (action: Parameters<typeof recordAudit>[0]['action'], after: Record<string, unknown>) =>
      recordAudit({
        action,
        siteId: site._id,
        actorUserId: actor.userId,
        actorRole: 'owner',
        targetType: 'Site',
        targetId: String(site._id),
        before,
        after,
        ip: actor.ip,
        userAgent: actor.userAgent,
      });

    if (change.connect === true && !before.connected) {
      if (change.acceptTerms !== true) {
        throw new ValidationError('Tick the box to accept the MrMouse connection terms', [
          { field: 'acceptTerms', message: 'Tick the box to accept the MrMouse connection terms' },
        ]);
      }
      site.set('integrations.mrmouse.connectedAt', new Date());
      site.set('integrations.mrmouse.connectedBy', actor.userId);
      site.set('integrations.mrmouse.termsVersion', MRMOUSE_TERMS_VERSION);
      await site.save();
      await audit('integration.mrmouse.connected', mrmouseState(site));
    }

    if (change.connect === false && (before.connected || before.termsOutdated)) {
      site.set('integrations.mrmouse.connectedAt', null);
      site.set('integrations.mrmouse.connectedBy', null);
      site.set('integrations.mrmouse.termsVersion', null);
      site.set('integrations.mrmouse.stockSync', false);
      await site.save();
      await audit('integration.mrmouse.disconnected', mrmouseState(site));
    }

    if (change.stockSync !== undefined && change.connect !== false) {
      if (!mrmouseState(site).connected) throw new ConflictError('Connect MrMouse first.');
      if (change.stockSync && !canSync(config)) {
        throw new ConflictError('Stock sync with MrMouse is not switched on for HordeMart yet.');
      }
      if (Boolean(site.integrations?.mrmouse?.stockSync) !== change.stockSync) {
        site.set('integrations.mrmouse.stockSync', change.stockSync);
        await site.save();
        await audit('integration.mrmouse.stock_sync_changed', mrmouseState(site));
      }
    }

    return mrmouseState(site);
  });
}

/**
 * A sign-in pass for this user on this store, and the URL to send them to.
 * Needs the owner's consent on the store and a confirmed email: MrMouse may
 * match accounts by email, so an unconfirmed one must never be vouched for.
 */
export async function issueMrMouseLaunch(
  session: AuthenticatedSession,
  site: SiteDocument,
  role: string,
  context: { ip?: string; userAgent?: string } = {},
  config: MrMouseConfig = mrmouseConfig(),
): Promise<{ url: string }> {
  if (!canLaunch(config)) throw new ConflictError('MrMouse on the web is not available yet.');
  if (!mrmouseState(site).connected) {
    throw new ForbiddenError('MrMouse not connected', 'The store owner needs to connect MrMouse first.');
  }
  if (!session.user.emailVerifiedAt) {
    throw new ForbiddenError(
      'Email not verified for MrMouse sign-in',
      'Confirm your email address first — MrMouse uses it to find your account.',
    );
  }

  const token = signHandoffToken(
    {
      sub: String(session.user._id),
      email: session.user.email,
      email_verified: true,
      name: session.user.name,
      role,
      site: { id: String(site._id), slug: site.slug, name: site.name, url: siteOrigin(site) },
    },
    config.ssoSecret as string,
  );

  await recordAudit({
    action: 'integration.mrmouse.launched',
    siteId: site._id,
    actorUserId: session.user._id,
    actorRole: role,
    targetType: 'Site',
    targetId: String(site._id),
    ip: context.ip,
    userAgent: context.userAgent,
  });

  return { url: launchUrl(config, token) };
}

export interface StockLine {
  sku: string;
  quantity: number;
}

/**
 * Stock levels from MrMouse, matched to this store's products by SKU.
 *
 * Quantity only, and it switches stock counting on for that product. A line
 * older than the last one applied (`sentAt` is MrMouse's clock) is skipped,
 * so a delayed or replayed message cannot put back yesterday's numbers.
 *
 * MrMouse's count cannot include sales it has not received yet (still being
 * retried, or delivered after it counted), so those units are taken off what
 * it sends — otherwise its push would put sold items back on the shelf.
 */
export async function applyMrMouseStock(
  site: SiteDocument,
  lines: StockLine[],
  sentAt: Date,
): Promise<{ updated: number; unknownSkus: string[]; stale: number }> {
  if (!mrmouseState(site).stockSync) throw new ConflictError('Stock sync with MrMouse is off for this store.');

  return runWithTenant({ siteId: String(site._id), slug: site.slug }, async () => {
    let updated = 0;
    let stale = 0;
    const unknownSkus: string[] = [];
    const notYetCounted = await salesMrMouseHasNotCounted(sentAt);

    for (const line of lines) {
      const quantity = Math.max(0, line.quantity - (notYetCounted.get(line.sku) ?? 0));
      // updateMany: a SKU shared by two listings (one colour, two pages) moves both.
      const result = await Product.updateMany(
        {
          sku: line.sku,
          status: { $ne: 'archived' },
          $or: [{ 'inventory.syncedAt': null }, { 'inventory.syncedAt': { $lt: sentAt } }],
        },
        { $set: { 'inventory.quantity': quantity, 'inventory.track': true, 'inventory.syncedAt': sentAt } },
      );
      if (result.matchedCount > 0) {
        updated += result.matchedCount;
      } else if (await Product.exists({ sku: line.sku, status: { $ne: 'archived' } })) {
        stale += 1;
      } else {
        unknownSkus.push(line.sku);
      }
    }

    return { updated, unknownSkus, stale };
  });
}

/**
 * Tell MrMouse a paid order took stock: SKUs and quantities, nothing about
 * the buyer and no amounts. Queued and retried until MrMouse confirms it
 * (./mrmouseSales.ts). Never throws — the sale itself is already recorded.
 */
export async function sendMrMouseSale(order: OrderAttributes, config: MrMouseConfig = mrmouseConfig()): Promise<void> {
  if (!canSync(config)) return;
  try {
    const site = await runWithoutTenantScope('reading the Site an order belongs to, for its MrMouse setting', () =>
      Site.findById(order.siteId),
    );
    if (!site || !mrmouseState(site).stockSync) return;

    const products = await runWithTenant({ siteId: String(site._id), slug: site.slug }, () =>
      Product.find({ _id: { $in: order.items.map((item) => item.productId) } })
        .select('sku')
        .lean(),
    );
    const skuById = new Map(products.map((product) => [String(product._id), product.sku]));
    const items = order.items
      .map((item) => ({ sku: skuById.get(String(item.productId)), quantity: item.quantity }))
      .filter((item): item is { sku: string; quantity: number } => Boolean(item.sku));

    await queueMrMouseSale(
      {
        siteId: site._id,
        orderId: order._id,
        orderNumber: order.orderNumber,
        paidAt: new Date(order.paystack?.paidAt ?? Date.now()),
        items,
      },
      { config },
    );
  } catch {
    console.error('[mrmouse] sale event not queued', order.orderNumber);
  }
}
