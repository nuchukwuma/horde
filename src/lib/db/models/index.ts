/**
 * Importing this barrel registers every model with Mongoose, which matters for
 * `ref`-based population: a ref to a model that was never imported fails at
 * runtime, and only on the code path that populates it.
 */

export { Plan } from './Plan';
export type { PlanAttributes, PlanCode, PlanLimits, FeeBearer } from './Plan';

export { User } from './User';
export type { UserAttributes, PlatformRole, UserStatus } from './User';

export { Membership } from './Membership';
export type { MembershipAttributes, SiteRole, StaffPermission } from './Membership';

export { Session } from './Session';
export type { SessionAttributes, SessionScope } from './Session';

export { Site } from './Site';
export type { SiteAttributes, SitePayout, SiteStatus, PayoutStatus, SiteModules } from './Site';

export { Product } from './Product';
export type { ProductAttributes, ProductImage, ProductStatus } from './Product';

export { Order } from './Order';
export type {
  OrderAttributes,
  OrderItem,
  OrderStatus,
  OrderSplit,
  OrderFeeSnapshot,
} from './Order';

export { LedgerEntry } from './LedgerEntry';
export type { LedgerEntryAttributes, LedgerEntryType, LedgerStatus } from './LedgerEntry';

export { WebhookEvent } from './WebhookEvent';
export type { WebhookEventAttributes, WebhookStatus } from './WebhookEvent';

export { AuditLog } from './AuditLog';
export type { AuditLogAttributes, AuditAction } from './AuditLog';
