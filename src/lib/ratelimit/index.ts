/**
 * Rate limiting backed by Upstash Redis.
 *
 * A shared store is not optional here. Per-process counters reset on every
 * deploy, split across replicas, and on serverless effectively never fire —
 * they provide the appearance of a limit rather than a limit.
 */

import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import { RateLimitError } from '../errors';

export type LimitName =
  | 'auth:login'
  | 'auth:signup'
  | 'auth:slug-check'
  | 'auth:verify-email'
  | 'auth:step-up'
  | 'auth:password-reset'
  | 'integration:launch'
  | 'integration:inventory'
  | 'site:slug-change'
  | 'shop:signup'
  | 'shop:login'
  | 'shop:verify-email'
  | 'chat:send'
  | 'payout:verify'
  | 'payout:update'
  | 'checkout:initialize'
  | 'checkout:quote'
  | 'checkout:confirm';

/**
 * Tuned to the cost of the action, not to a single global number.
 *
 * `payout:verify` is deliberately tight: each call spends Paystack API quota
 * and, unthrottled, turns our endpoint into a free bank-account enumerator.
 */
const LIMITS: Record<LimitName, { tokens: number; window: `${number} ${'s' | 'm' | 'h'}` }> = {
  'auth:login': { tokens: 10, window: '10 m' },
  'auth:signup': { tokens: 5, window: '1 h' },
  // Typing a store name is interactive, so this has to be loose enough to
  // check on every keystroke-ish and tight enough that it is not a free
  // "which stores exist" scanner. Slugs are hostnames and therefore public
  // anyway, so the limit is about cost, not secrecy.
  'auth:slug-check': { tokens: 60, window: '10 m' },
  // Tight: what is being rationed is mail delivered to one inbox. A seller
  // who genuinely did not receive it can try a few times an hour; a script
  // cannot use us to flood an address.
  'auth:verify-email': { tokens: 6, window: '1 h' },
  // Keyed by user. A stolen session cookie must not become an unlimited
  // password-guessing oracle for the account behind it.
  'auth:step-up': { tokens: 8, window: '15 m' },
  // Applied twice: per address (mail to one inbox) and per client (a script
  // walking a list of addresses). Resetting a password is rare; 5 an hour is
  // plenty for a person.
  'auth:password-reset': { tokens: 5, window: '1 h' },
  // Each launch mints a sign-in pass for another service; a person opens
  // MrMouse a few times an hour at most.
  'integration:launch': { tokens: 30, window: '10 m' },
  // Per store. MrMouse batches stock changes; this is a backstop, not a budget.
  'integration:inventory': { tokens: 120, window: '10 m' },
  // A store's address is what its customers trust; changing it often is a
  // fraud pattern, and every change breaks shoppers' sign-ins.
  'site:slug-change': { tokens: 3, window: '720 h' },
  // Per storefront per client. Shopper signup is cheaper to abuse than seller
  // signup (no site is created) but it still writes a row and burns a hash.
  'shop:signup': { tokens: 10, window: '1 h' },
  'shop:login': { tokens: 10, window: '10 m' },
  // Same reasoning as auth:verify-email: mail to one shopper's inbox.
  'shop:verify-email': { tokens: 6, window: '1 h' },
  // Generous: this is a conversation, and a limit that interrupts one pushes
  // both parties to WhatsApp, where we can see nothing at all.
  'chat:send': { tokens: 60, window: '10 m' },
  'payout:verify': { tokens: 10, window: '1 h' },
  'payout:update': { tokens: 5, window: '24 h' },
  'checkout:initialize': { tokens: 20, window: '10 m' },
  // A cart page re-prices on every quantity change, so this is loose; it is a
  // read, and the limit is about cost.
  'checkout:quote': { tokens: 240, window: '10 m' },
  // Each call spends Paystack verify quota, so it is keyed per order reference:
  // a shopper refreshing the receipt page is fine, a script hammering it is not.
  'checkout:confirm': { tokens: 12, window: '10 m' },
};

let redis: Redis | null = null;
const limiters = new Map<LimitName, Ratelimit>();

function isConfigured(): boolean {
  return Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
}

function getLimiter(name: LimitName): Ratelimit {
  redis ??= new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL as string,
    token: process.env.UPSTASH_REDIS_REST_TOKEN as string,
  });

  let limiter = limiters.get(name);
  if (!limiter) {
    const { tokens, window } = LIMITS[name];
    limiter = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(tokens, window),
      prefix: `hm:rl:${name}`,
      analytics: false,
    });
    limiters.set(name, limiter);
  }

  return limiter;
}

/**
 * Consume one token for `identifier`, or throw RateLimitError.
 *
 * With Upstash unconfigured this allows the request in development and throws
 * at startup in production. Silently disabling a payment-path rate limit
 * because an env var is missing is how a limit turns out not to exist on the
 * day it is needed.
 */
export async function enforceRateLimit(name: LimitName, identifier: string): Promise<void> {
  if (!isConfigured()) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        `Rate limiting is not configured (UPSTASH_REDIS_REST_URL / _TOKEN) and ${name} ` +
          'must not run unlimited in production',
      );
    }
    return;
  }

  const result = await getLimiter(name).limit(identifier);

  if (!result.success) {
    const retryAfterSeconds = Math.max(1, Math.ceil((result.reset - Date.now()) / 1000));
    throw new RateLimitError(retryAfterSeconds);
  }
}

/**
 * Best-effort client identifier.
 *
 * Spoofable when not behind a trusted proxy, which is why rate limits are a
 * cost control and a speed bump, never an authorisation check. Prefer a user or
 * site id when the caller is authenticated.
 */
export function clientIdentifier(request: Request, fallback = 'anonymous'): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  return request.headers.get('x-real-ip') ?? fallback;
}
