/**
 * Request-scoped tenant context.
 *
 * The tenant-scope Mongoose plugin reads the ambient siteId from here and injects
 * it into every query, so application code never hand-writes `{ siteId }` and
 * therefore cannot forget it. A tenant-owned query with no ambient tenant throws
 * rather than returning cross-tenant rows — the failure mode is a 500, never a
 * data leak.
 *
 * Node runtime only (AsyncLocalStorage). Do not import from `middleware.ts`.
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import { TenantScopeError } from '../errors';

export interface TenantIdentity {
  /** Site _id as a 24-character hex string. This alone defines the scope. */
  siteId: string;
  /**
   * Optional, and carried for diagnostics only — nothing in the scoping path
   * reads it. Callers that resolved the tenant from a host have it and should
   * pass it; callers that only hold an id (a session row, a webhook) must not
   * have to fetch the Site just to satisfy a type.
   */
  slug?: string;
}

export interface TenantBypass {
  reason: string;
}

export interface TenantContext extends Partial<TenantIdentity> {
  bypass?: TenantBypass;
}

/**
 * ONE store per process, held on globalThis.
 *
 * A module-level `new AsyncLocalStorage()` is only a singleton if the module
 * is loaded once, and under Next.js it is not: route bundles can each carry
 * their own copy of this file. Mongoose models, by contrast, are registered
 * once per process (`mongoose.models.X ?? mongoose.model(...)`), so the
 * tenant plugin on a model kept reading whichever copy of `storage` existed
 * when the model was first registered — while a page from another bundle
 * called runWithTenant on a different copy. The plugin saw no tenant and
 * threw (fail-closed, so nothing leaked), and which pages broke depended on
 * which route happened to load first. Keying the store on globalThis makes
 * every copy of this module share it, the same way the models are shared.
 */
const STORAGE_KEY = Symbol.for('hordemart.tenant-context');

type GlobalWithTenantStorage = typeof globalThis & {
  [STORAGE_KEY]?: AsyncLocalStorage<TenantContext>;
};

const globalScope = globalThis as GlobalWithTenantStorage;
const storage: AsyncLocalStorage<TenantContext> =
  globalScope[STORAGE_KEY] ?? (globalScope[STORAGE_KEY] = new AsyncLocalStorage<TenantContext>());

/**
 * Run `fn` with `tenant` as the ambient tenant. Every tenant-owned query inside
 * is automatically filtered to this site.
 *
 * Async, and it awaits `fn` internally, which is load-bearing rather than
 * stylistic. A Mongoose query is a lazy thenable: `Model.find()` builds a Query
 * and only executes on await. If this helper merely returned that Query, it
 * would execute in whatever context awaited it — by which point this scope has
 * exited and the tenant is gone. Awaiting here keeps execution inside the scope.
 *
 * Getting it wrong still fails safe: a query that escapes the scope throws
 * TenantScopeError rather than returning unfiltered rows.
 */
export async function runWithTenant<T>(
  tenant: TenantIdentity,
  fn: () => T | Promise<T>,
): Promise<T> {
  if (!/^[a-f0-9]{24}$/i.test(tenant.siteId)) {
    throw new TenantScopeError(`runWithTenant received a malformed siteId: ${tenant.siteId}`);
  }
  return storage.run({ siteId: tenant.siteId, slug: tenant.slug }, async () => await fn());
}

/**
 * Synchronous variant, for inspecting context without touching the database.
 * Never pass a function that builds a query — see runWithTenant.
 */
export function runWithTenantSync<T>(tenant: TenantIdentity, fn: () => T): T {
  if (!/^[a-f0-9]{24}$/i.test(tenant.siteId)) {
    throw new TenantScopeError(`runWithTenantSync received a malformed siteId: ${tenant.siteId}`);
  }
  return storage.run({ siteId: tenant.siteId, slug: tenant.slug }, fn);
}

/**
 * Escape hatch for genuinely cross-tenant work: platform admin reporting,
 * reconciliation, webhook intake that has not yet identified a site.
 *
 * Deliberately verbose and greppable. Every call site should be auditable by
 * running `grep -rn runWithoutTenantScope src/`. The reason string is required
 * so an auditor can tell intent from accident.
 */
export async function runWithoutTenantScope<T>(
  reason: string,
  fn: () => T | Promise<T>,
): Promise<T> {
  assertReason(reason);
  return storage.run({ bypass: { reason } }, async () => await fn());
}

/** Synchronous variant. Same caveat as runWithTenantSync. */
export function runWithoutTenantScopeSync<T>(reason: string, fn: () => T): T {
  assertReason(reason);
  return storage.run({ bypass: { reason } }, fn);
}

function assertReason(reason: string): void {
  if (!reason || reason.trim().length < 10) {
    throw new TenantScopeError(
      'runWithoutTenantScope requires a descriptive reason (10+ characters) for the audit trail',
    );
  }
}

export function getTenantContext(): TenantContext | undefined {
  return storage.getStore();
}

export function getTenantId(): string | undefined {
  return storage.getStore()?.siteId;
}

export function isScopeBypassed(): boolean {
  return storage.getStore()?.bypass !== undefined;
}

/**
 * The siteId every tenant-owned query is filtered by.
 * Throws when there is no ambient tenant — fail closed, never fail open.
 */
export function requireTenantId(modelName = 'a tenant-owned model'): string {
  const store = storage.getStore();

  if (store?.bypass) {
    throw new TenantScopeError(
      `requireTenantId called for ${modelName} while tenant scope is bypassed ` +
        `(reason: ${store.bypass.reason}). Pass an explicit siteId instead.`,
    );
  }

  if (!store?.siteId) {
    throw new TenantScopeError(
      `No tenant in scope for ${modelName}. Wrap the call in runWithTenant(), or ` +
        'use runWithoutTenantScope("<reason>") if this is deliberately cross-tenant.',
    );
  }

  return store.siteId;
}
