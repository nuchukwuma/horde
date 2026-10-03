/**
 * The MrMouse wire formats: the sign-in pass and signed server messages.
 * MrMouse implements the same checks (docs/integrations/mrmouse.md).
 */

import { shouldSuggestMrMouse } from '../../src/lib/integrations/mrmousePromo';
import { describe, expect, it } from 'vitest';
import {
  canLaunch,
  canSync,
  launchUrl,
  mrmouseConfig,
  signBody,
  signHandoffToken,
  verifyBodySignature,
  verifyHandoffToken,
} from '../../src/lib/integrations/mrmouse';

const SECRET = 's'.repeat(40);
const claims = {
  sub: 'u1',
  email: 'ade@example.com',
  email_verified: true,
  name: 'Ade',
  role: 'owner',
  site: { id: 'site1', slug: 'ade', name: 'Ade Textiles', url: 'https://ade.hordemart.com' },
};

describe('MrMouse configuration', () => {
  it('is off until both a URL and a long enough secret are set', () => {
    expect(canLaunch(mrmouseConfig({}))).toBe(false);
    expect(canLaunch(mrmouseConfig({ MRMOUSE_WEB_URL: 'https://app.mrmouse.ng', MRMOUSE_SSO_SECRET: 'short' }))).toBe(false);
    expect(canLaunch(mrmouseConfig({ MRMOUSE_WEB_URL: 'https://app.mrmouse.ng/', MRMOUSE_SSO_SECRET: SECRET }))).toBe(true);
    expect(canSync(mrmouseConfig({ MRMOUSE_API_URL: 'https://api.mrmouse.ng', MRMOUSE_WEBHOOK_SECRET: SECRET }))).toBe(true);
  });

  it('refuses a plain-http address in production', () => {
    const config = mrmouseConfig({ NODE_ENV: 'production', MRMOUSE_WEB_URL: 'http://app.mrmouse.ng', MRMOUSE_SSO_SECRET: SECRET });
    expect(config.webUrl).toBeNull();
  });

  it('puts the pass in the fragment, which browsers never send to a server', () => {
    const config = mrmouseConfig({ MRMOUSE_WEB_URL: 'https://app.mrmouse.ng/', MRMOUSE_SSO_SECRET: SECRET });
    const url = new URL(launchUrl(config, 'abc.def.ghi'));
    expect(url.pathname).toBe('/');
    expect(url.searchParams.get('sso')).toBe('hordemart');
    expect(url.search).not.toContain('token');
    expect(url.hash).toBe('#token=abc.def.ghi');
  });
});

describe('sign-in pass', () => {
  it('round-trips, lasts 60 seconds, and carries a unique id', () => {
    const now = Date.UTC(2026, 9, 2, 9, 0, 0);
    const token = signHandoffToken(claims, SECRET, now);
    const read = verifyHandoffToken(token, SECRET, now + 30_000);
    expect(read).toMatchObject({ iss: 'hordemart', aud: 'mrmouse', sub: 'u1', site: { slug: 'ade' } });
    expect(read!.exp - read!.iat).toBe(60);
    expect(verifyHandoffToken(token, SECRET, now + 61_000)).toBeNull();
    expect(signHandoffToken(claims, SECRET, now)).not.toBe(token);
  });

  it('rejects a wrong secret, a tampered payload and a different algorithm', () => {
    const token = signHandoffToken(claims, SECRET);
    expect(verifyHandoffToken(token, 'x'.repeat(40))).toBeNull();
    const [head, payload, sig] = token.split('.');
    const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(payload!, 'base64url').toString()), sub: 'someone-else' })).toString('base64url');
    expect(verifyHandoffToken(`${head}.${forged}.${sig}`, SECRET)).toBeNull();
    const none = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    expect(verifyHandoffToken(`${none}.${payload}.${sig}`, SECRET)).toBeNull();
    expect(verifyHandoffToken('not-a-token', SECRET)).toBeNull();
  });
});

describe('signed server messages', () => {
  const body = JSON.stringify({ siteId: 'x', items: [{ sku: 'A', quantity: 3 }] });

  it('accepts a fresh, correct signature', () => {
    const now = Date.now();
    expect(verifyBodySignature(body, signBody(body, SECRET, now), SECRET, now + 1_000)).toBe(true);
  });

  it('rejects a changed body, a wrong secret, a missing header and an old message', () => {
    const now = Date.now();
    const header = signBody(body, SECRET, now);
    expect(verifyBodySignature(body.replace('3', '300'), header, SECRET, now)).toBe(false);
    expect(verifyBodySignature(body, header, 'y'.repeat(40), now)).toBe(false);
    expect(verifyBodySignature(body, null, SECRET, now)).toBe(false);
    expect(verifyBodySignature(body, 't=abc,v1=zz', SECRET, now)).toBe(false);
    expect(verifyBodySignature(body, header, SECRET, now + 6 * 60_000)).toBe(false);
  });
});

describe('suggesting MrMouse in the dashboard', () => {
  const base = { storeOn: true, productCount: 3, connected: false, snoozed: false };
  it('suggests it to a selling store with products that has not connected', () => {
    expect(shouldSuggestMrMouse(base)).toBe(true);
  });
  it('stays quiet before there is stock to manage, once connected, when snoozed, or with no shop', () => {
    expect(shouldSuggestMrMouse({ ...base, productCount: 0 })).toBe(false);
    expect(shouldSuggestMrMouse({ ...base, connected: true })).toBe(false);
    expect(shouldSuggestMrMouse({ ...base, snoozed: true })).toBe(false);
    expect(shouldSuggestMrMouse({ ...base, storeOn: false })).toBe(false);
  });
});
