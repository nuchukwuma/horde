/**
 * Price a cart for display, from the database.
 *
 * The cart a browser keeps is a list of product ids and quantities, and that
 * is all it is trusted for. What a line costs, whether it is still for sale
 * and whether there is stock are read here — the same reads checkout makes —
 * so the total a shopper is shown is the total Paystack is asked to charge.
 *
 * Unlike checkout, a problem with one line does not fail the whole quote: the
 * line comes back marked unavailable so the cart can say which item and why,
 * instead of refusing to show anything.
 */

import { Types } from 'mongoose';
import { Product, type ProductAttributes } from '../db/models/Product';
import type { SiteDocument } from '../db/models/Site';
import { addKobo, assertKobo } from '../money/kobo';
import type { CartLine } from './createCheckout';

export interface QuoteLine {
  productId: string;
  slug: string;
  title: string;
  imageUrl: string | null;
  unitPriceKobo: number;
  quantity: number;
  lineTotalKobo: number;
  /** null when the line can be bought as it stands. */
  problem: 'unavailable' | 'insufficient_stock' | null;
  /** How many could be bought, when stock is what limits the line. */
  maxQuantity: number | null;
}

export interface CartQuote {
  lines: QuoteLine[];
  subtotalKobo: number;
  /** Ids the store no longer sells at all. The cart should drop them. */
  removedProductIds: string[];
  canCheckout: boolean;
  /** Why checkout is closed, when it is — the same gate checkout enforces. */
  blockedReason: string | null;
}

export async function quoteCart(site: SiteDocument, lines: CartLine[]): Promise<CartQuote> {
  const quantities = new Map<string, number>();
  for (const line of lines) {
    if (!Types.ObjectId.isValid(line.productId)) continue;
    quantities.set(line.productId, (quantities.get(line.productId) ?? 0) + line.quantity);
  }

  const products = quantities.size
    ? await Product.find({ _id: { $in: [...quantities.keys()] }, status: 'active' }).lean()
    : [];
  const byId = new Map(products.map((product) => [String(product._id), product as ProductAttributes]));

  const quoted: QuoteLine[] = [];
  const removedProductIds: string[] = [];
  let subtotalKobo = 0;

  for (const [productId, quantity] of quantities) {
    const product = byId.get(productId);
    if (!product) {
      removedProductIds.push(productId);
      continue;
    }

    const limited = product.inventory?.track && product.inventory.policy === 'deny';
    const available = limited ? product.inventory.quantity : null;
    const problem =
      available === null ? null : available <= 0 ? 'unavailable' : available < quantity ? 'insufficient_stock' : null;

    const lineTotalKobo = assertKobo(product.priceKobo * quantity, 'lineTotalKobo');
    if (!problem) subtotalKobo = addKobo(subtotalKobo, lineTotalKobo);

    quoted.push({
      productId,
      slug: product.slug,
      title: product.title,
      imageUrl: product.images?.[0]?.url ?? null,
      unitPriceKobo: product.priceKobo,
      quantity,
      lineTotalKobo,
      problem,
      maxQuantity: available,
    });
  }

  const gate = site.canAcceptPayments();
  const hasProblem = quoted.some((line) => line.problem !== null);

  return {
    lines: quoted,
    subtotalKobo,
    removedProductIds,
    canCheckout: gate.allowed && quoted.length > 0 && !hasProblem,
    blockedReason: gate.allowed ? null : (gate.reason ?? 'not_accepting_payments'),
  };
}
