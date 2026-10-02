/**
 * POST /api/integrations/mrmouse/inventory — stock levels from MrMouse's server.
 *
 * Server to server: no cookie, no session. The body must carry a valid
 * X-MrMouse-Signature (HMAC with MRMOUSE_WEBHOOK_SECRET, at most 5 minutes
 * old), checked on the raw text before anything is parsed. The store must
 * have switched stock sync on; its owner's consent is what makes the store
 * id in the body acceptable. Quantities only — no price is ever taken.
 *
 *   { "siteId": "…", "sentAt": "2026-10-02T09:00:00Z",
 *     "items": [{ "sku": "ADIRE-01", "quantity": 12 }] }
 */

import type { NextRequest } from 'next/server';
import { Types } from 'mongoose';
import { z } from 'zod';
import { ensureDatabase } from '@/lib/http/context';
import { ok, toErrorResponse } from '@/lib/http/respond';
import { enforceRateLimit } from '@/lib/ratelimit';
import { Site } from '@/lib/db/models/Site';
import { runWithoutTenantScope } from '@/lib/tenant/context';
import { AuthenticationError, NotFoundError } from '@/lib/errors';
import { canSync, mrmouseConfig, verifyBodySignature } from '@/lib/integrations/mrmouse';
import { applyMrMouseStock } from '@/lib/integrations/mrmouseService';
import { retryDueMrMouseSales } from '@/lib/integrations/mrmouseSales';

export const runtime = 'nodejs';

const MAX_BODY_BYTES = 256 * 1024;

const inventorySchema = z.object({
  siteId: z.string().refine((value) => Types.ObjectId.isValid(value), 'Invalid store id'),
  sentAt: z.string().datetime(),
  items: z
    .array(
      z.object({
        sku: z.string().trim().min(1).max(64),
        quantity: z.number().int().min(0).max(1_000_000),
      }),
    )
    .min(1)
    .max(500),
});

export async function POST(request: NextRequest) {
  try {
    const config = mrmouseConfig();
    // Not configured here: say nothing about whether the endpoint exists.
    if (!canSync(config)) throw new NotFoundError('Page');

    const raw = await request.text();
    if (raw.length > MAX_BODY_BYTES) throw new AuthenticationError('MrMouse inventory body too large');
    if (!verifyBodySignature(raw, request.headers.get('x-mrmouse-signature'), config.webhookSecret as string)) {
      throw new AuthenticationError('Bad MrMouse signature', 'Signature missing, invalid or too old.');
    }

    const body = inventorySchema.parse(JSON.parse(raw));
    await ensureDatabase();
    await enforceRateLimit('integration:inventory', `site:${body.siteId}`);

    const site = await runWithoutTenantScope('resolving the store a signed MrMouse message names', () =>
      Site.findById(body.siteId),
    );
    if (!site) throw new NotFoundError('Store');

    const result = await applyMrMouseStock(site, body.items, new Date(body.sentAt));
    // MrMouse is evidently reachable: a good moment to send this store's
    // unconfirmed sales. Not awaited — MrMouse is waiting on this answer.
    void retryDueMrMouseSales({ siteId: site._id, limit: 10 }).catch(() => {});
    return ok(result);
  } catch (error) {
    return toErrorResponse(error);
  }
}
