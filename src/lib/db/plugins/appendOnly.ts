/**
 * Append-only collections.
 *
 * Financial records are evidence. If a ledger row can be edited, it proves
 * nothing about what happened — and "what happened" is exactly what a seller
 * dispute or a regulator asks for. So: inserts only. A mistake is corrected by
 * writing a reversing entry, never by editing the original.
 *
 * This also means status is fixed at write time. A sale that later settles does
 * not have its row updated; a new entry referencing the same groupId records the
 * settlement. The history of an order is the sum of its entries.
 */

import type { Schema, HydratedDocument } from 'mongoose';
import { ImmutableRecordError } from '../../errors';

/**
 * Anchored alternation rather than string literals: Mongoose's `pre` overloads
 * cannot resolve a union of operation names.
 */
const BLOCKED_OPERATIONS =
  /^(deleteMany|deleteOne|findOneAndDelete|findOneAndReplace|findOneAndUpdate|replaceOne|update|updateMany|updateOne)$/;

export interface AppendOnlyOptions {
  modelName: string;
}

export function appendOnlyPlugin(schema: Schema, options: AppendOnlyOptions): void {
  const { modelName } = options;

  schema.pre(BLOCKED_OPERATIONS, function blockMutation(this: { op?: string }) {
    throw new ImmutableRecordError(modelName, this.op ?? 'this mutation');
  });

  schema.pre('save', function blockResave(this: HydratedDocument<unknown>) {
    if (!this.isNew) {
      throw new ImmutableRecordError(modelName, 'save on an existing document');
    }
  });

  // Mongoose exposes no schema-level hook for Model.bulkWrite or the raw driver
  // collection, so those bypass this plugin. Enforcement is by convention plus
  // the code-review checklist; there is no way to close it in the ORM layer.
  schema.set('strict', 'throw');
}
