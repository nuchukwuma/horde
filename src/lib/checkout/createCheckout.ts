/**
 * Checkout: turn a cart of product ids into a pending Order and a Paystack
 * payment page.
 *
 * The cart the client sends contains ids and quantities. Nothing else from it
 * is used. Prices, line totals, the order total, and the split are all read or
 * computed server-side — a client that sends `price: 1` gets charged the real
 * price, because its price field is never looked at.
 */

import { randomBytes } from 'node:crypto';
import { acceptanceStamp } from '../legal/terms';
import type { Types } from 'mongoose';
import { Order, type OrderDelivery, type OrderItem } from '../db/models/Order';
import { Plan } from '../db/models/Plan';
import { Product } from '../db/models/Product';
import type { SiteDocument } from '../db/models/Site';
import { computeSplit, type FeeTerms } from '../payments/computeSplit';
import { initializeTransaction } from '../paystack/transactions';
import type { PaystackCallOptions } from '../paystack/accounts';
import { addKobo, assertKobo } from '../money/kobo';
import { ConflictError, NotFoundError, PayoutNotVerifiedError, ValidationError } from '../errors';
import { runWithoutTenantScope, runWithTenant } from '../tenant/context';

export interface CartLine {
  productId: string;
  quantity: number;
}

export interface CheckoutInput {
  site: SiteDocument;
  items: CartLine[];
  customerEmail: string;
  customerName?: string;
  /** Normalised +234XXXXXXXXXX (checkoutSchema). */
  customerPhone?: string;
  delivery?: OrderDelivery | null;
  /**
   * Set only when a signed-in shopper is checking out. Null for a guest, which
   * is the normal case and always will be — an account is never required to
   * buy. The order stands on its own either way: customerEmail is what a
   * receipt and a dispute are argued from, not this link.
   */
  customerId?: Types.ObjectId | null;
  callbackUrl?: string;
}

export interface CheckoutResult {
  orderId: string;
  orderNumber: string;
  reference: string;
  authorizationUrl: string;
  totalKobo: number;
}

/**
 * Human-readable and collision-resistant without a counter collection.
 *
 * A strictly sequential number would need a shared counter and a race to go
 * with it; the unique index on (siteId, orderNumber) is the real guard either
 * way. Time-prefixed so orders sort naturally.
 */
function generateOrderNumber(): string {
  const stamp = Date.now().toString(36).toUpperCase();
  const suffix = randomBytes(3).toString('hex').toUpperCase();
  return `HM-${stamp}-${suffix}`;
}

/** Our reference is the idempotency key the Phase 4 webhook dedupes on. */
function generatePaystackReference(): string {
  return `hm_${randomBytes(16).toString('hex')}`;
}

export async function createCheckout(
  input: CheckoutInput,
  options: PaystackCallOptions = {},
): Promise<CheckoutResult> {
  const { site } = input;

  // One gate, checked before anything else happens. An unverified, suspended,
  // flagged, or held site cannot take money.
  const gate = site.canAcceptPayments();
  if (!gate.allowed) {
    throw new PayoutNotVerifiedError(`This store cannot accept payments yet (${gate.reason})`);
  }

  if (input.items.length === 0) {
    throw new ValidationError('Your cart is empty');
  }

  const siteId = String(site._id);

  const { items, subtotalKobo } = await runWithTenant(
    { siteId, slug: site.slug },
    () => buildOrderItems(input.items),
  );

  const totalKobo = subtotalKobo;
  const terms = await loadFeeTerms(site.planCode);
  const split = computeSplit(totalKobo, terms);

  const reference = generatePaystackReference();
  const orderNumber = generateOrderNumber();

  // The order is created pending BEFORE Paystack is called. If initialize fails
  // we are left with an abandoned pending order, which is harmless and
  // observable. The reverse — a customer paying for an order we never recorded —
  // is not recoverable from.
  const order = await runWithTenant({ siteId, slug: site.slug }, () =>
    Order.create({
      orderNumber,
      customerId: input.customerId ?? null,
      customerEmail: input.customerEmail,
      customerName: input.customerName,
      customerPhone: input.customerPhone,
      // Copied field by field: only what the method needs is kept.
      delivery: input.delivery
        ? input.delivery.method === 'delivery'
          ? {
              method: 'delivery',
              address: input.delivery.address,
              city: input.delivery.city,
              state: input.delivery.state,
              note: input.delivery.note || undefined,
            }
          : { method: 'pickup', note: input.delivery.note || undefined }
        : null,
      // checkoutSchema refuses a body without acceptTerms: true.
      ...acceptanceStamp(),
      items,
      subtotalKobo,
      shippingKobo: 0,
      discountKobo: 0,
      totalKobo,
      feeSnapshot: {
        planCode: site.planCode,
        feePercentBps: terms.feePercentBps,
        feeFlatKobo: terms.feeFlatKobo,
        feeCapKobo: terms.feeCapKobo,
        vatOnPlatformFeeBps: terms.vatOnPlatformFeeBps,
        paystackFeeBearer: terms.paystackFeeBearer,
      },
      split: {
        grossKobo: split.gross,
        platformFeeKobo: split.platformFee,
        platformFeeVatKobo: split.platformFeeVat,
        paystackFeeKobo: split.paystackFee,
        sellerNetKobo: split.sellerNet,
      },
      status: 'pending',
      paystack: { reference },
    }),
  );

  const initialized = await initializeTransaction(
    {
      amountKobo: totalKobo,
      email: input.customerEmail,
      reference,
      subaccount: site.payout.subaccountCode as string,
      transactionCharge: split.transactionChargeKobo,
      bearer: terms.paystackFeeBearer === 'platform' ? 'account' : 'subaccount',
      callbackUrl: input.callbackUrl,
      metadata: { orderId: String(order._id), siteId, orderNumber },
    },
    options,
  );

  await runWithTenant({ siteId, slug: site.slug }, () =>
    Order.updateOne(
      { _id: order._id },
      {
        $set: {
          'paystack.accessCode': initialized.access_code,
          'paystack.authorizationUrl': initialized.authorization_url,
        },
      },
    ),
  );

  return {
    orderId: String(order._id),
    orderNumber,
    reference,
    authorizationUrl: initialized.authorization_url,
    totalKobo,
  };
}

/**
 * Re-read every product from the database and price the cart from that.
 *
 * Runs inside tenant scope, so a product id belonging to another seller's store
 * simply is not found — a cart cannot reach across stores.
 */
async function buildOrderItems(
  lines: CartLine[],
): Promise<{ items: OrderItem[]; subtotalKobo: number }> {
  const quantities = new Map<string, number>();
  for (const line of lines) {
    if (!Number.isInteger(line.quantity) || line.quantity < 1) {
      throw new ValidationError('Item quantity must be a whole number of at least 1');
    }
    // Merge duplicates rather than creating two lines for the same product.
    quantities.set(line.productId, (quantities.get(line.productId) ?? 0) + line.quantity);
  }

  const products = await Product.find({
    _id: { $in: [...quantities.keys()] },
    status: 'active',
  });

  if (products.length !== quantities.size) {
    // ConflictError, not NotFoundError: that would read "… not found" twice over.
    throw new ConflictError('Something in your basket is no longer for sale. Refresh the page and try again.');
  }

  const items: OrderItem[] = [];
  let subtotalKobo = 0;

  for (const product of products) {
    const quantity = quantities.get(String(product._id)) as number;

    if (product.inventory.track && product.inventory.policy === 'deny') {
      if (product.inventory.quantity < quantity) {
        throw new ConflictError(`Not enough stock for ${product.title}`);
      }
    }

    const lineTotalKobo = assertKobo(product.priceKobo * quantity, 'lineTotalKobo');

    items.push({
      productId: product._id as Types.ObjectId,
      title: product.title,
      unitPriceKobo: product.priceKobo,
      quantity,
      lineTotalKobo,
    });

    subtotalKobo = addKobo(subtotalKobo, lineTotalKobo);
  }

  return { items, subtotalKobo };
}

/**
 * Fee terms for a plan.
 *
 * Plan is platform-level, not tenant-owned, so it is read outside tenant scope.
 */
async function loadFeeTerms(planCode: string): Promise<FeeTerms> {
  const plan = await runWithoutTenantScope(
    'reading a Plan, which is platform-level configuration and not tenant-owned',
    () => Plan.findOne({ code: planCode, active: true }),
  );

  if (!plan) {
    throw new NotFoundError(`Plan "${planCode}"`);
  }

  return {
    feePercentBps: plan.feePercentBps,
    feeFlatKobo: plan.feeFlatKobo,
    feeCapKobo: plan.feeCapKobo,
    vatOnPlatformFeeBps: plan.vatOnPlatformFeeBps,
    paystackFeeBearer: plan.paystackFeeBearer,
  };
}
