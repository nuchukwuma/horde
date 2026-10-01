/**
 * Fail-closed multi-tenancy for Mongoose.
 *
 * Applying this plugin to a schema:
 *   - adds a required, indexed `siteId`
 *   - injects `siteId` into the filter of every read, update, and delete
 *   - stamps `siteId` onto every insert
 *   - throws if there is no ambient tenant
 *
 * The guarantee is that application code never writes `{ siteId }` by hand, so it
 * cannot forget to. A query that escapes the ambient tenant raises TenantScopeError
 * instead of returning another seller's rows.
 */

import type { Schema, Query, Aggregate, HydratedDocument } from 'mongoose';
import { Types } from 'mongoose';
import { isScopeBypassed, requireTenantId } from '../../tenant/context';
import { TenantScopeError } from '../../errors';

/**
 * Query operations whose filter must be tenant-scoped.
 *
 * Written as anchored alternations rather than a list of string literals
 * because Mongoose's `pre` overloads cannot resolve a union of operation names.
 * Anchoring keeps the set exact — notably, this must not catch
 * estimatedDocumentCount, which is blocked separately below.
 */
const FILTERED_OPERATIONS =
  /^(count|countDocuments|deleteMany|deleteOne|distinct|find|findOne|findOneAndDelete|findOneAndReplace|findOneAndUpdate|replaceOne|updateMany|updateOne)$/;

const UPDATE_OPERATIONS = /^(findOneAndUpdate|replaceOne|updateMany|updateOne)$/;

export interface TenantScopeOptions {
  /** Used in error messages so a violation names the collection involved. */
  modelName: string;
}

function toObjectId(siteId: string): Types.ObjectId {
  return new Types.ObjectId(siteId);
}

/** True when `path` is siteId itself or a path inside it (`siteId.x`). */
function isSiteIdPath(path: string): boolean {
  return path === 'siteId' || path.startsWith('siteId.');
}

function objectNamesSiteId(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  if (Array.isArray(value)) {
    // `$unset: ['siteId']` in a pipeline stage.
    return value.some((entry) => typeof entry === 'string' && isSiteIdPath(entry));
  }
  return Object.keys(value).some(isSiteIdPath);
}

/**
 * Whether an update document or pipeline could change, remove or replace
 * siteId. Exported for the plugin's own tests.
 */
export function updateTouchesSiteId(update: unknown): boolean {
  if (!update || typeof update !== 'object') return false;

  if (Array.isArray(update)) {
    return update.some((stage) => {
      if (!stage || typeof stage !== 'object') return false;
      return Object.entries(stage as Record<string, unknown>).some(([operator, body]) => {
        if (operator === '$replaceRoot' || operator === '$replaceWith') return true;
        if (operator === '$unset' && typeof body === 'string') return isSiteIdPath(body);
        return objectNamesSiteId(body);
      });
    });
  }

  return Object.entries(update as Record<string, unknown>).some(([key, body]) => {
    // A bare field in a replacement document or an operator-less update.
    if (!key.startsWith('$')) return isSiteIdPath(key);
    if (key === '$rename') {
      // Renaming another field ONTO siteId is as bad as renaming siteId away.
      const renames = body as Record<string, unknown> | undefined;
      if (!renames || typeof renames !== 'object') return false;
      return Object.entries(renames).some(
        ([from, to]) => isSiteIdPath(from) || (typeof to === 'string' && isSiteIdPath(to)),
      );
    }
    return objectNamesSiteId(body);
  });
}

export function tenantScopePlugin(schema: Schema, options: TenantScopeOptions): void {
  const { modelName } = options;

  schema.add({
    siteId: {
      type: Types.ObjectId,
      ref: 'Site',
      required: true,
      index: true,
      immutable: true,
    },
  });

  function scopeQuery(this: Query<unknown, unknown>): void {
    if (isScopeBypassed()) return;

    const siteId = requireTenantId(modelName);
    const filter = this.getFilter();
    const requested = filter.siteId;

    if (requested !== undefined && requested !== null) {
      // An explicit siteId that disagrees with the ambient tenant is always a
      // bug or an attack. Never silently prefer one over the other.
      if (String(requested) !== siteId) {
        throw new TenantScopeError(
          `${modelName} query requested siteId ${String(requested)} while tenant ${siteId} is in scope`,
        );
      }
    }

    this.where({ siteId: toObjectId(siteId) });
  }

  function guardUpdatePayload(this: Query<unknown, unknown>): void {
    const update = this.getUpdate();
    if (!update) return;

    // siteId is `immutable: true`, but Mongoose only enforces that on documents,
    // not on raw update operators — so reparenting has to be blocked here too.
    //
    // Every operator is checked, not only $set. `$unset: { siteId: 1 }` orphans
    // a document out of every tenant, `$rename` moves the value away, and
    // `$setOnInsert` reparents on an upsert. A pipeline update (an array of
    // stages) can do all of that in `$set`/`$addFields`/`$unset`/`$project`,
    // and `$replaceRoot`/`$replaceWith` swap the whole document — so those two
    // are refused outright rather than inspected.
    if (updateTouchesSiteId(update)) {
      throw new TenantScopeError(
        `${modelName} update attempted to modify siteId; documents cannot move between tenants`,
      );
    }
  }

  schema.pre(FILTERED_OPERATIONS, scopeQuery);
  schema.pre(UPDATE_OPERATIONS, guardUpdatePayload);

  // estimatedDocumentCount reads collection metadata and ignores filters
  // entirely, so on a shared collection it always leaks the platform-wide total.
  schema.pre('estimatedDocumentCount', function blockEstimatedCount() {
    throw new TenantScopeError(
      `${modelName}.estimatedDocumentCount() cannot be tenant-scoped. Use countDocuments().`,
    );
  });

  schema.pre('aggregate', function scopeAggregate(this: Aggregate<unknown>) {
    if (isScopeBypassed()) return;
    const siteId = requireTenantId(modelName);
    this.pipeline().unshift({ $match: { siteId: toObjectId(siteId) } });
  });

  // Stamping happens on validate, not save: Mongoose validates before running
  // user save hooks, so a siteId applied in pre('save') arrives after the
  // required-field check has already failed.
  schema.pre('validate', function stampTenant(this: HydratedDocument<{ siteId?: Types.ObjectId }>) {
    if (!this.isNew) return;

    if (isScopeBypassed()) {
      if (!this.siteId) {
        throw new TenantScopeError(
          `${modelName} requires an explicit siteId when saving with tenant scope bypassed`,
        );
      }
      return;
    }

    const siteId = requireTenantId(modelName);

    if (!this.siteId) {
      this.siteId = toObjectId(siteId);
      return;
    }

    if (String(this.siteId) !== siteId) {
      throw new TenantScopeError(
        `${modelName} save carries siteId ${String(this.siteId)} while tenant ${siteId} is in scope`,
      );
    }
  });

  schema.pre('save', function guardReparent(this: HydratedDocument<{ siteId?: Types.ObjectId }>) {
    if (!this.isNew && this.isModified('siteId')) {
      throw new TenantScopeError(`${modelName} documents cannot be moved between tenants`);
    }
  });

  schema.pre('insertMany', function stampTenantOnMany(next, docs: unknown) {
    if (isScopeBypassed()) return next();
    if (!Array.isArray(docs)) return next();

    let siteId: string;
    try {
      siteId = requireTenantId(modelName);
    } catch (error) {
      return next(error as Error);
    }

    for (const doc of docs as Array<Record<string, unknown>>) {
      if (doc.siteId === undefined || doc.siteId === null) {
        doc.siteId = toObjectId(siteId);
      } else if (String(doc.siteId) !== siteId) {
        return next(
          new TenantScopeError(
            `${modelName} insertMany carries siteId ${String(doc.siteId)} while tenant ${siteId} is in scope`,
          ),
        );
      }
    }

    return next();
  });
}
