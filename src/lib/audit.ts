/**
 * Audit trail writer.
 *
 * An audit log is widely readable by design, which makes it a bad place for
 * secrets. Everything written here passes through `redactForAudit`, which drops
 * known-sensitive keys rather than trusting each call site to remember.
 */

import type { Types } from 'mongoose';
import { AuditLog, type AuditAction } from './db/models/AuditLog';
import { runWithoutTenantScope } from './tenant/context';

/**
 * Keys never written to an audit record, matched case-insensitively as
 * substrings so `newAccountNumber` and `account_number` both go.
 */
/**
 * Checked before the sensitive list, because these contain a sensitive key as a
 * substring while being safe — and harmless-looking over-redaction is not
 * harmless: an audit trail that hides the last four digits cannot be used to
 * investigate the fraud it exists to catch.
 */
const SAFE_KEYS = ['accountnumberlast', 'accountnamelast', 'cardlast'];

const SENSITIVE_KEYS = [
  'accountnumber',
  'password',
  'passwordhash',
  'token',
  'secret',
  'apikey',
  'authorization',
  'cvv',
  'pan',
  'bvn',
  'nin',
];

export function redactForAudit(value: unknown, depth = 0): unknown {
  if (depth > 4 || value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map((item) => redactForAudit(item, depth + 1));
  if (typeof value !== 'object') return value;

  const result: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    const normalised = key.toLowerCase().replace(/[^a-z]/g, '');
    const isSafe = SAFE_KEYS.some((safe) => normalised.startsWith(safe));
    const isSensitive =
      !isSafe && SENSITIVE_KEYS.some((sensitive) => normalised.includes(sensitive));

    result[key] = isSensitive ? '[redacted]' : redactForAudit(entry, depth + 1);
  }
  return result;
}

export interface AuditInput {
  action: AuditAction;
  siteId?: Types.ObjectId | null;
  actorUserId?: Types.ObjectId | null;
  actorRole?: string;
  targetType?: string;
  targetId?: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  ip?: string;
  userAgent?: string;
}

/**
 * Write an audit record.
 *
 * Runs outside tenant scope because platform-level actions have no tenant and
 * AuditLog carries a nullable siteId supplied by the caller.
 */
export async function recordAudit(input: AuditInput): Promise<void> {
  await runWithoutTenantScope(
    'writing an audit record, which spans tenant and platform-level actions',
    () =>
      AuditLog.create({
        ...input,
        before: (redactForAudit(input.before) as Record<string, unknown>) ?? null,
        after: (redactForAudit(input.after) as Record<string, unknown>) ?? null,
      }),
  );
}
