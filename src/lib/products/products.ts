/**
 * Product authoring and reading.
 *
 * Every function here runs inside a tenant scope the caller established
 * (withSite / runWithTenant). None of them names a siteId in a query: the
 * tenant plugin adds it, and a call made outside a scope throws instead of
 * reading another store's catalogue.
 *
 * Money arrives as the naira string the seller typed and leaves this module as
 * integer kobo. The conversion happens once, here, through nairaToKobo — never
 * through parseFloat, which would turn ₦1,000.10 into 100009.99999 kobo.
 */

import { Types } from 'mongoose';
import { Product, type ProductAttributes } from '../db/models/Product';
import type { SiteDocument } from '../db/models/Site';
import { nairaToKobo } from '../money/kobo';
import { sanitizeRichText } from '../security/sanitizeHtml';
import { slugifyOrFallback, uniqueSlug } from '../content/slug';
import { NotFoundError, ValidationError } from '../errors';
import { requireTenantId } from '../tenant/context';
import { assertImageCount, assertQuota } from '../billing/quota';
import type { CreateProductInput, UpdateProductInput } from '../validation/schemas';
import { assertOwnProductImages } from './images';

/** What the dashboard and storefront need; never the raw document. */
export interface ProductView {
  id: string;
  title: string;
  slug: string;
  descriptionHtml: string;
  priceKobo: number;
  compareAtPriceKobo: number | null;
  sku: string | null;
  status: ProductAttributes['status'];
  trackInventory: boolean;
  quantity: number;
  inStock: boolean;
  images: Array<{ url: string; alt: string; width?: number; height?: number }>;
  createdAt: string | null;
}

export function toProductView(product: ProductAttributes): ProductView {
  const track = Boolean(product.inventory?.track);
  const quantity = product.inventory?.quantity ?? 0;
  const policy = product.inventory?.policy ?? 'deny';

  return {
    id: String(product._id),
    title: product.title,
    slug: product.slug,
    descriptionHtml: product.descriptionHtml ?? '',
    priceKobo: product.priceKobo,
    compareAtPriceKobo: product.compareAtPriceKobo ?? null,
    sku: product.sku ?? null,
    status: product.status,
    trackInventory: track,
    quantity,
    inStock: !track || policy === 'continue' || quantity > 0,
    images: (product.images ?? []).map((image) => ({
      url: image.url,
      alt: image.alt ?? product.title,
      width: image.width,
      height: image.height,
    })),
    createdAt: product.createdAt ? new Date(product.createdAt).toISOString() : null,
  };
}

/**
 * A "was" price only means something above the price. Equal or lower would
 * advertise a discount that is not one — misleading, and in Nigeria the
 * FCCPA treats that as a consumer-protection matter, not a typo.
 */
function compareAtKobo(
  compareAt: string | null | undefined,
  priceKobo: number,
): number | null {
  if (compareAt === undefined || compareAt === null || compareAt === '') return null;
  const kobo = nairaToKobo(compareAt);
  if (kobo <= priceKobo) {
    throw new ValidationError('The "was" price must be higher than the price', {
      field: 'compareAtPriceNaira',
    });
  }
  return kobo;
}

function priceKoboFrom(priceNaira: string): number {
  const kobo = nairaToKobo(priceNaira);
  // Paystack's minimum card charge is ₦50. A product priced below it can be
  // listed but never bought, which is a support ticket waiting to happen.
  if (kobo < 5_000) {
    throw new ValidationError('Prices start at ₦50 — Paystack cannot charge less', {
      field: 'priceNaira',
    });
  }
  return kobo;
}

export async function createProduct(
  site: SiteDocument,
  input: CreateProductInput,
): Promise<ProductView> {
  await assertQuota(site, 'products');
  assertImageCount(site, input.images?.length ?? 0);

  const priceKobo = priceKoboFrom(input.priceNaira);
  const siteId = requireTenantId('Product');

  const desired = slugifyOrFallback(input.title, 'product');
  const slug = await uniqueSlug(desired, async (candidate) =>
    Boolean(await Product.exists({ slug: candidate })),
  );

  const product = await Product.create({
    title: input.title,
    slug,
    descriptionHtml: input.descriptionHtml ? sanitizeRichText(input.descriptionHtml) : '',
    priceKobo,
    compareAtPriceKobo: compareAtKobo(input.compareAtPriceNaira, priceKobo),
    sku: input.sku || undefined,
    status: input.status,
    inventory: {
      track: input.trackInventory,
      quantity: input.quantity,
      policy: 'deny',
    },
    images: assertOwnProductImages(input.images ?? [], siteId),
  });

  return toProductView(product.toObject() as ProductAttributes);
}

export async function updateProduct(
  site: SiteDocument,
  productId: string,
  input: UpdateProductInput,
): Promise<ProductView> {
  if (!Types.ObjectId.isValid(productId)) throw new NotFoundError('Product');

  const product = await Product.findById(productId);
  if (!product) throw new NotFoundError('Product');

  if (input.title !== undefined) product.title = input.title;
  if (input.descriptionHtml !== undefined) {
    product.descriptionHtml = sanitizeRichText(input.descriptionHtml);
  }
  if (input.priceNaira !== undefined) product.priceKobo = priceKoboFrom(input.priceNaira);
  if (input.compareAtPriceNaira !== undefined || input.priceNaira !== undefined) {
    const raw =
      input.compareAtPriceNaira !== undefined
        ? input.compareAtPriceNaira
        : product.compareAtPriceKobo
          ? (product.compareAtPriceKobo / 100).toFixed(2)
          : null;
    product.compareAtPriceKobo = compareAtKobo(raw, product.priceKobo);
  }
  if (input.sku !== undefined) product.sku = input.sku || undefined;
  if (input.status !== undefined) product.status = input.status;
  if (input.trackInventory !== undefined) product.inventory.track = input.trackInventory;
  if (input.quantity !== undefined) product.inventory.quantity = input.quantity;
  if (input.images !== undefined) {
    assertImageCount(site, input.images.length);
    product.set('images', assertOwnProductImages(input.images, requireTenantId('Product')));
  }

  await product.save();
  return toProductView(product.toObject() as ProductAttributes);
}

/**
 * Archive rather than delete. Orders keep their own snapshot of title and
 * price, so nothing breaks either way — but an archived product can be
 * restored, and a seller who deleted their best-seller by mistake cannot.
 */
export async function archiveProduct(productId: string): Promise<void> {
  if (!Types.ObjectId.isValid(productId)) throw new NotFoundError('Product');
  const result = await Product.updateOne({ _id: productId }, { $set: { status: 'archived' } });
  if (result.matchedCount === 0) throw new NotFoundError('Product');
}

export async function listProductsForSeller(): Promise<ProductView[]> {
  const products = await Product.find({ status: { $ne: 'archived' } })
    .sort({ createdAt: -1 })
    .limit(500)
    .lean();
  return products.map((product) => toProductView(product as ProductAttributes));
}

export async function listActiveProducts(limit = 60): Promise<ProductView[]> {
  const products = await Product.find({ status: 'active' })
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();
  return products.map((product) => toProductView(product as ProductAttributes));
}

export async function findActiveProduct(slug: string): Promise<ProductView | null> {
  const product = await Product.findOne({ slug: String(slug).toLowerCase(), status: 'active' }).lean();
  return product ? toProductView(product as ProductAttributes) : null;
}
