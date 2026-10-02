/**
 * MrMouse — the seller's inventory app — connected to a HordeMart store.
 *
 * MrMouse is a separate product: its own backend, its own database, its own
 * subscription. HordeMart never reads MrMouse's database and MrMouse never
 * reads ours. They meet in three places, all signed with a secret shared only
 * between the two servers (environment variables, never logged):
 *
 *   1. One-click sign-in. A seller presses "Open MrMouse" in their dashboard;
 *      HordeMart issues a 60-second signed pass (an HS256 JWT) naming who they
 *      are and which store, and sends the browser to MrMouse's web app
 *      (`/?sso=hordemart`) with the pass in the URL *fragment* — which browsers never send to a server
 *      or put in a Referer, so it does not land in anyone's access logs.
 *      MrMouse verifies it, signs them in to their own MrMouse account.
 *   2. Stock in (optional, per store). MrMouse pushes stock levels by SKU to
 *      HordeMart's signed inventory endpoint. Quantities only — a price from
 *      outside is never accepted (CLAUDE.md rule 3).
 *   3. Sales out (optional, same switch). When a HordeMart order is paid,
 *      HordeMart tells MrMouse which SKUs sold and how many, so MrMouse can
 *      take them off its stock. No customer details, no amounts.
 *
 * The contract MrMouse implements is in docs/integrations/mrmouse.md.
 */

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export interface MrMouseConfig {
  /** MrMouse's web app, e.g. https://app.mrmouse.ng. Sign-in lands at /?sso=hordemart. */
  webUrl: string | null;
  /** MrMouse's server API, for sale events. */
  apiUrl: string | null;
  /** Signs the sign-in pass. Shared with MrMouse; 32+ characters. */
  ssoSecret: string | null;
  /** Signs stock and sale messages in both directions. Shared; 32+ characters. */
  webhookSecret: string | null;
  androidUrl: string | null;
  iosUrl: string | null;
}

const MIN_SECRET_LENGTH = 32;

function url(value: string | undefined, env: Record<string, string | undefined>): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    // https only in production: the sign-in pass travels in this URL.
    const local = parsed.hostname === 'localhost' || parsed.hostname.endsWith('.local');
    if (parsed.protocol !== 'https:' && !(env.NODE_ENV !== 'production' && local)) return null;
    return parsed.href.replace(/\/$/, '');
  } catch {
    return null;
  }
}

function secret(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed && trimmed.length >= MIN_SECRET_LENGTH ? trimmed : null;
}

export function mrmouseConfig(env: Record<string, string | undefined> = process.env): MrMouseConfig {
  return {
    webUrl: url(env.MRMOUSE_WEB_URL, env),
    apiUrl: url(env.MRMOUSE_API_URL, env),
    ssoSecret: secret(env.MRMOUSE_SSO_SECRET),
    webhookSecret: secret(env.MRMOUSE_WEBHOOK_SECRET),
    androidUrl: url(env.MRMOUSE_ANDROID_URL, env),
    iosUrl: url(env.MRMOUSE_IOS_URL, env),
  };
}

/** Whether "Open MrMouse on the web" can work on this server. */
export function canLaunch(config: MrMouseConfig): boolean {
  return Boolean(config.webUrl && config.ssoSecret);
}

/** Whether stock sync can work on this server. */
export function canSync(config: MrMouseConfig): boolean {
  return Boolean(config.apiUrl && config.webhookSecret);
}

// ---------------------------------------------------------------- sign-in pass

export const HANDOFF_TTL_SECONDS = 60;

export interface HandoffClaims {
  iss: 'hordemart';
  aud: 'mrmouse';
  /** HordeMart user id. Stable; MrMouse links its account to this, not to the email. */
  sub: string;
  email: string;
  email_verified: boolean;
  name: string;
  /** owner or staff on this store. */
  role: string;
  site: { id: string; slug: string; name: string; url: string };
  iat: number;
  exp: number;
  /** Single use: MrMouse must refuse a jti it has seen before. */
  jti: string;
}

const base64url = (input: Buffer | string) => Buffer.from(input).toString('base64url');

function hmac(secretKey: string, data: string): Buffer {
  return createHmac('sha256', secretKey).update(data).digest();
}

export function signHandoffToken(
  claims: Omit<HandoffClaims, 'iss' | 'aud' | 'iat' | 'exp' | 'jti'>,
  secretKey: string,
  now = Date.now(),
): string {
  const iat = Math.floor(now / 1000);
  const payload: HandoffClaims = {
    iss: 'hordemart',
    aud: 'mrmouse',
    ...claims,
    iat,
    exp: iat + HANDOFF_TTL_SECONDS,
    jti: randomBytes(16).toString('hex'),
  };
  const head = `${base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))}.${base64url(JSON.stringify(payload))}`;
  return `${head}.${base64url(hmac(secretKey, head))}`;
}

/**
 * The check MrMouse's server performs (docs/integrations/mrmouse.md), here so
 * the two sides are tested against the same rules. Returns null for anything
 * not exactly right; never says which part failed.
 */
export function verifyHandoffToken(token: string, secretKey: string, now = Date.now()): HandoffClaims | null {
  const parts = String(token ?? '').split('.');
  if (parts.length !== 3) return null;
  const [header, payload, signature] = parts as [string, string, string];
  try {
    if (JSON.parse(Buffer.from(header, 'base64url').toString()).alg !== 'HS256') return null;
    const expected = hmac(secretKey, `${header}.${payload}`);
    const given = Buffer.from(signature, 'base64url');
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString()) as HandoffClaims;
    const seconds = Math.floor(now / 1000);
    if (claims.iss !== 'hordemart' || claims.aud !== 'mrmouse') return null;
    if (typeof claims.exp !== 'number' || claims.exp < seconds) return null;
    if (typeof claims.iat !== 'number' || claims.iat > seconds + 30) return null;
    return claims;
  } catch {
    return null;
  }
}

/**
 * Where the browser goes: MrMouse's web app root, flagged with
 * ?sso=hordemart. The pass rides in the fragment, never the query.
 *
 * The root rather than a /sso/hordemart path because MrMouse builds with
 * relative asset URLs (it also ships as a desktop app over file://), and
 * on a deeper path those resolve to the wrong folder and the page is blank.
 */
export function launchUrl(config: MrMouseConfig, token: string): string {
  return `${config.webUrl}/?sso=hordemart#token=${token}`;
}

// ----------------------------------------------------- signed server messages

/** How old a signed message may be. Bounds replay; clocks may drift a little. */
export const SIGNATURE_TOLERANCE_SECONDS = 300;

/** `t=<unix seconds>,v1=<hex HMAC-SHA256 of "<t>.<raw body>">` */
export function signBody(rawBody: string, secretKey: string, now = Date.now()): string {
  const t = Math.floor(now / 1000);
  return `t=${t},v1=${hmac(secretKey, `${t}.${rawBody}`).toString('hex')}`;
}

export function verifyBodySignature(
  rawBody: string,
  header: string | null | undefined,
  secretKey: string,
  now = Date.now(),
): boolean {
  if (!header) return false;
  const fields = Object.fromEntries(
    header.split(',').map((part) => {
      const index = part.indexOf('=');
      return [part.slice(0, index).trim(), part.slice(index + 1).trim()];
    }),
  );
  const t = Number(fields.t);
  if (!Number.isInteger(t) || Math.abs(Math.floor(now / 1000) - t) > SIGNATURE_TOLERANCE_SECONDS) return false;
  if (!/^[a-f0-9]{64}$/.test(fields.v1 ?? '')) return false;
  const expected = hmac(secretKey, `${t}.${rawBody}`);
  const given = Buffer.from(fields.v1 as string, 'hex');
  return given.length === expected.length && timingSafeEqual(given, expected);
}
