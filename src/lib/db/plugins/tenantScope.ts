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
    if (!update || Array.isArray(update)) return;

    const record = update as Record<string, unknown>;
    const direct = record.siteId;
    const set = record.$set as Record<string, unknown> | undefined;
    const candidates = [direct, set?.siteId].filter((value) => value !== undefined && value !== null);

    if (candidates.length === 0) return;

    // siteId is `immutable: true`, but Mongoose only enforces that on documents,
    // not on raw update operators — so reparenting has to be blocked here too.
    throw new TenantScopeError(
      `${modelName} update attempted to modify siteId; documents cannot move between tenants`,
    );
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
