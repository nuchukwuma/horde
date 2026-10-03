/**
 * Unsubscribe links for setup tips (lib/email/nudges.ts).
 *
 * A link has to work without signing in — that is the law's expectation and
 * the reader's — so it carries its own proof: an HMAC of the user id under
 * EMAIL_LINK_SECRET. Knowing someone's id is not enough to unsubscribe them,
 * and the link never expires, because an unsubscribe link that stops working
 * after a week is a complaint waiting to happen.
 *
 * The worst a leaked link can do is turn off tips for that one account.
 *
 * No secret configured means no valid links, which is why nudges.ts refuses
 * to send anything without one: never send an email whose unsubscribe link
 * cannot work.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';
import { AppError } from '../errors';
import { User } from '../db/models/User';
import { appOrigin } from '../seo/meta';

type Env = Record<string, string | undefined>;

export class EmailLinkSecretMissingError extends AppError {
  constructor() {
    super(500, 'email_link_secret_missing', 'EMAIL_LINK_SECRET is not set or is shorter than 32 characters', {
      publicMessage: 'Email settings are not configured.',
    });
  }
}

function linkSecret(env: Env): string | null {
  const secret = env.EMAIL_LINK_SECRET ?? '';
  return secret.length >= 32 ? secret : null;
}

export function hasEmailLinkSecret(env: Env = process.env): boolean {
  return linkSecret(env) !== null;
}

export function unsubscribeSignature(userId: string, env: Env = process.env): string {
  const secret = linkSecret(env);
  if (!secret) throw new EmailLinkSecretMissingError();
  // The purpose is part of the message, so this secret can sign other kinds
  // of link later without one being accepted as another.
  return createHmac('sha256', secret).update(`unsubscribe:nudges:v1:${userId}`).digest('base64url');
}

export function verifyUnsubscribe(userId: string, signature: string, env: Env = process.env): boolean {
  if (!/^[a-f0-9]{24}$/i.test(userId) || !linkSecret(env)) return false;
  const expected = Buffer.from(unsubscribeSignature(userId, env));
  const given = Buffer.from(signature);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

function query(userId: string, env: Env): string {
  return `u=${encodeURIComponent(userId)}&t=${encodeURIComponent(unsubscribeSignature(userId, env))}`;
}

/** The page a reader lands on from the footer link: one button, no sign-in. */
export function unsubscribePageUrl(userId: string, env: Env = process.env): string {
  return `${appOrigin(env.APP_HOST)}/unsubscribe?${query(userId, env)}`;
}

/** RFC 8058 one-click: the mail client POSTs here itself. */
export function unsubscribeOneClickUrl(userId: string, env: Env = process.env): string {
  return `${appOrigin(env.APP_HOST)}/api/email/unsubscribe?${query(userId, env)}`;
}

export function unsubscribeHeaders(userId: string, env: Env = process.env): Record<string, string> {
  return {
    'List-Unsubscribe': `<${unsubscribeOneClickUrl(userId, env)}>`,
    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
  };
}

/** Idempotent: a second click keeps the first opt-out date. */
export async function optOutOfNudges(userId: string): Promise<void> {
  await User.updateOne({ _id: userId, nudgeOptOutAt: null }, { $set: { nudgeOptOutAt: new Date() } });
}

export async function setNudgesWanted(userId: string, wanted: boolean): Promise<void> {
  if (wanted) {
    await User.updateOne({ _id: userId }, { $set: { nudgeOptOutAt: null } });
  } else {
    await optOutOfNudges(userId);
  }
}
