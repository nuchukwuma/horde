/**
 * Orders as the seller sees them: who bought what, where it goes, whether it
 * has been sent.
 *
 * Every function runs inside the caller's tenant scope (withSite), so an
 * order id from another store is simply not found.
 */

import { Types } from 'mongoose';
import { Order, type OrderAttributes, type OrderDelivery, type OrderStatus } from '../db/models/Order';
import { ConflictError, NotFoundError } from '../errors';

export type OrderFilter = 'paid' | 'refunded' | 'unpaid';

/**
 * "Unpaid" is a checkout someone opened and did not finish. Kept out of the
 * default view, where a seller looks for what to send.
 */
const STATUSES: Record<OrderFilter, OrderStatus[]> = {
  paid: ['paid', 'partially_refunded', 'disputed'],
  refunded: ['refunded'],
  unpaid: ['pending', 'failed', 'cancelled'],
};

export interface SellerOrderView {
  id: string;
  orderNumber: string;
  createdAt: string | null;
  paidAt: string | null;
  status: OrderStatus;
  customerName: string | null;
  customerEmail: string;
  customerPhone: string | null;
  delivery: OrderDelivery | null;
  items: Array<{ title: string; quantity: number; unitPriceKobo: number; lineTotalKobo: number }>;
  itemCount: number;
  totalKobo: number;
  sellerNetKobo: number;
  fulfilledAt: string | null;
}

const iso = (value: Date | null | undefined) => (value ? new Date(value).toISOString() : null);

export function toSellerOrderView(order: OrderAttributes): SellerOrderView {
  return {
    id: String(order._id),
    orderNumber: order.orderNumber,
    createdAt: iso(order.createdAt),
    paidAt: iso(order.paystack?.paidAt),
    status: order.status,
    customerName: order.customerName ?? null,
    customerEmail: order.customerEmail,
    customerPhone: order.customerPhone ?? null,
    delivery: order.delivery
      ? {
          method: order.delivery.method,
          address: order.delivery.address,
          city: order.delivery.city,
          state: order.delivery.state,
          note: order.delivery.note,
        }
      : null,
    items: order.items.map((item) => ({
      title: item.title,
      quantity: item.quantity,
      unitPriceKobo: item.unitPriceKobo,
      lineTotalKobo: item.lineTotalKobo,
    })),
    itemCount: order.items.reduce((sum, item) => sum + item.quantity, 0),
    totalKobo: order.totalKobo,
    sellerNetKobo: order.split?.sellerNetKobo ?? 0,
    fulfilledAt: iso(order.fulfilledAt),
  };
}

export async function listOrdersForSeller(filter: OrderFilter = 'paid', limit = 100): Promise<SellerOrderView[]> {
  const orders = await Order.find({ status: { $in: STATUSES[filter] } })
    .sort({ createdAt: -1 })
    .limit(Math.min(Math.max(limit, 1), 200))
    .lean();
  return orders.map((order) => toSellerOrderView(order as OrderAttributes));
}

/** How many paid orders are still waiting to be sent — the number a seller acts on. */
export async function countOrdersToSend(): Promise<number> {
  return Order.countDocuments({ status: { $in: ['paid', 'partially_refunded'] }, fulfilledAt: null });
}

export async function findOrderForSeller(orderId: string): Promise<SellerOrderView | null> {
  if (!Types.ObjectId.isValid(orderId)) return null;
  const order = await Order.findById(orderId).lean();
  return order ? toSellerOrderView(order as OrderAttributes) : null;
}

/**
 * Mark an order sent (or collected), or undo that. Only a paid order can be
 * fulfilled: marking an unpaid one sent is how goods leave without money.
 */
export async function setOrderFulfilled(orderId: string, fulfilled: boolean): Promise<SellerOrderView> {
  if (!Types.ObjectId.isValid(orderId)) throw new NotFoundError('Order');
  const order = await Order.findById(orderId);
  if (!order) throw new NotFoundError('Order');
  if (fulfilled && !['paid', 'partially_refunded'].includes(order.status)) {
    throw new ConflictError('Only a paid order can be marked as sent.');
  }
  order.fulfilledAt = fulfilled ? (order.fulfilledAt ?? new Date()) : null;
  await order.save();
  return toSellerOrderView(order.toObject() as OrderAttributes);
}
