/**
 * Email layout, templates, sender names and unsubscribe signatures. Pure
 * functions: no database, no network.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { escapeHtml, renderEmail, safeUrl } from '../../src/lib/email/layout';
import {
  customerVerifyEmail,
  newOrderSellerEmail,
  nudgeEmail,
  orderReceiptEmail,
  passwordResetEmail,
  payoutChangedEmail,
  verifyEmail,
  verifyEmailReminder,
} from '../../src/lib/email/templates';
import { fromWithName, sendEmail } from '../../src/lib/email/transport';
import {
  unsubscribeHeaders,
  unsubscribePageUrl,
  unsubscribeSignature,
  verifyUnsubscribe,
} from '../../src/lib/email/unsubscribe';
import { nudgesEnabled } from '../../src/lib/email/nudges';

const LINK = 'https://app.hordemart.test/verify-email?token=abc';
const env = { APP_HOST: 'app.hordemart.test', EMAIL_LINK_SECRET: 'x'.repeat(40) };

afterEach(() => {
  vi.restoreAllMocks();
});

describe('email layout', () => {
  it('escapes everything typed by a seller or shopper', () => {
    const email = orderReceiptEmail({
      customerName: '<img src=x onerror=alert(1)>',
      storeName: 'Ade "Fabrics" & <Co>',
      orderNumber: 'HM-1',
      total: '₦5,000.00',
      itemLines: ['1 × <script>alert(1)</script> — ₦5,000.00'],
      deliveryLine: 'Collect it.',
      receiptUrl: 'https://ade.hordemart.test/checkout/complete?reference=r',
      messagesUrl: 'https://ade.hordemart.test/account/messages',
    });
    expect(email.html).not.toMatch(/<script>|<img src=x|<Co>/);
    expect(email.html).toContain('&lt;script&gt;');
    expect(email.html).toContain('Ade &quot;Fabrics&quot; &amp; &lt;Co&gt;');
    // The text version is plain text: no escaping, no markup.
    expect(email.text).toContain('Ade "Fabrics" & <Co>');
    expect(email.text).not.toContain('<td');
  });

  it('refuses a link that is not absolute http(s)', () => {
    expect(() => safeUrl('javascript:alert(1)')).toThrow();
    expect(() => safeUrl('/relative')).toThrow();
    expect(() =>
      renderEmail({
        preheader: 'p',
        heading: 'h',
        blocks: [{ kind: 'button', button: { label: 'Go', url: 'javascript:alert(1)' } }],
        reason: 'r',
      }),
    ).toThrow();
  });

  it('prints the button URL as text too, for clients that break buttons', () => {
    const email = verifyEmail({ name: 'Ada', link: LINK });
    const href = escapeHtml(LINK);
    // The button's href, the fallback link's href, and its visible text.
    expect(email.html.split(href).length - 1).toBe(3);
    expect(email.text).toContain(`Confirm my email:\n${LINK}`);
  });

  it('keeps a seller-typed line break from splitting a paragraph', () => {
    const email = payoutChangedEmail({
      name: 'Ada',
      storeName: 'Line\r\nBreak',
      accountName: 'ADA OBI',
      accountNumberLast4: '1234',
    });
    expect(email.text).toContain('Line Break');
  });

  it('gives every template a subject, an HTML body and a matching text body', () => {
    const all = [
      verifyEmail({ name: 'Ada', link: LINK }),
      verifyEmailReminder({ name: 'Ada', link: LINK }),
      passwordResetEmail({ name: 'Ada', link: LINK }),
      payoutChangedEmail({ name: 'Ada', storeName: 'Ade', accountName: 'ADA OBI', accountNumberLast4: '1234' }),
      newOrderSellerEmail({
        name: 'Ada',
        storeName: 'Ade',
        orderNumber: 'HM-1',
        buyer: 'Bola',
        total: '₦5,000.00',
        itemLines: ['1 × Shirt — ₦5,000.00'],
        pickup: false,
        orderUrl: 'https://app.hordemart.test/dashboard/x/orders/y',
      }),
      customerVerifyEmail({ name: 'Bola', storeName: 'Ade', link: 'https://ade.hordemart.test/account/verify?token=t' }),
      nudgeEmail({
        kind: 'no_products',
        name: 'Ada',
        storeName: 'Ade',
        actionUrl: 'https://app.hordemart.test/dashboard/x/products/new',
        unsubscribeUrl: 'https://app.hordemart.test/unsubscribe?u=1&t=2',
      }),
    ];
    for (const email of all) {
      expect(email.subject.length).toBeGreaterThan(5);
      expect(email.html).toMatch(/^<!doctype html>/);
      expect(email.html).toContain('HordeMart');
      expect(email.text.length).toBeGreaterThan(40);
    }
  });

  it('leads a shopper email with the store’s name, not ours', () => {
    const email = customerVerifyEmail({ name: 'Bola', storeName: 'Ade Fabrics', link: LINK });
    expect(email.subject).toBe('Confirm your email for Ade Fabrics');
    expect(email.html).toContain('on HordeMart');
  });

  it('puts an unsubscribe link on setup tips, and only there', () => {
    const tip = nudgeEmail({
      kind: 'no_payout',
      name: 'Ada',
      storeName: 'Ade',
      actionUrl: 'https://app.hordemart.test/dashboard/x/payouts',
      unsubscribeUrl: 'https://app.hordemart.test/unsubscribe?u=1&t=2',
    });
    expect(tip.html).toContain('Stop these emails');
    expect(tip.text).toContain('Stop these emails: https://app.hordemart.test/unsubscribe?u=1&amp;t=2'.replace('&amp;', '&'));
    expect(verifyEmail({ name: 'Ada', link: LINK }).html).not.toContain('Stop these emails');
  });

  it('greets someone with no name without a dangling comma', () => {
    expect(orderReceiptEmail({
      customerName: '  ',
      storeName: 'Ade',
      orderNumber: 'HM-1',
      total: '₦1.00',
      itemLines: [],
      deliveryLine: 'x',
      receiptUrl: 'https://a.test/r',
      messagesUrl: 'https://a.test/m',
    }).text).toMatch(/^Hi there,/);
  });
});

describe('sender name', () => {
  it('names the store and keeps EMAIL_FROM’s address', () => {
    expect(fromWithName('Ade Fabrics', { EMAIL_FROM: 'HordeMart <mail@hordemart.com>' })).toBe(
      '"Ade Fabrics via HordeMart" <mail@hordemart.com>',
    );
    expect(fromWithName('Ade', { EMAIL_FROM: 'mail@hordemart.com' })).toBe('"Ade via HordeMart" <mail@hordemart.com>');
  });

  it('strips anything that could break out of the header or the quoted name', () => {
    const from = fromWithName('Evil"\r\nBcc: victim@x.com <attacker@x.com>\\', { EMAIL_FROM: 'mail@hordemart.com' });
    expect(from).not.toMatch(/[\r\n]/);
    expect(from.match(/"/g)).toHaveLength(2);
    expect(from.match(/</g)).toHaveLength(1);
    expect(from.endsWith('<mail@hordemart.com>')).toBe(true);
  });

  it('falls back to the plain sender when nothing usable is left', () => {
    expect(fromWithName('""<>', { EMAIL_FROM: 'HordeMart <mail@hordemart.com>' })).toBe('HordeMart <mail@hordemart.com>');
  });
});

describe('transport headers', () => {
  it('refuses headers other than the unsubscribe pair, and line breaks in values', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => {});
    const base = { to: 'a@b.test', subject: 's', text: 't' };
    await expect(sendEmail({ ...base, headers: { Bcc: 'x@y.test' } }, {})).rejects.toThrow(/not allowed/);
    await expect(
      sendEmail({ ...base, headers: { 'List-Unsubscribe': '<https://a.test>\r\nBcc: x@y.test' } }, {}),
    ).rejects.toThrow(/line break/);
    await expect(sendEmail({ ...base, headers: { 'List-Unsubscribe': '<https://a.test>' } }, {})).resolves.toMatchObject({
      transport: 'log',
    });
  });

  it('passes the headers and HTML to Resend', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ id: 'e_1' })));
    await sendEmail(
      { to: 'a@b.test', subject: 's', text: 't', html: '<p>t</p>', fromName: 'Ade', headers: unsubscribeHeaders('a'.repeat(24), env) },
      { RESEND_API_KEY: 're_test', EMAIL_FROM: 'mail@hordemart.com', ...env },
    );
    const body = JSON.parse(String(fetchSpy.mock.calls[0]?.[1]?.body));
    expect(body.from).toBe('"Ade via HordeMart" <mail@hordemart.com>');
    expect(body.subject).toBe('s');
    expect(body.html).toBe('<p>t</p>');
    expect(body.headers['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click');
    expect(body.headers['List-Unsubscribe']).toMatch(/^<http:\/\/app\.hordemart\.test\/api\/email\/unsubscribe\?u=a{24}&t=/);
  });
});

describe('unsubscribe links', () => {
  const id = '65f0a1b2c3d4e5f6a7b8c9d0';

  it('accepts its own signature and nothing else', () => {
    const t = unsubscribeSignature(id, env);
    expect(verifyUnsubscribe(id, t, env)).toBe(true);
    expect(verifyUnsubscribe('65f0a1b2c3d4e5f6a7b8c9d1', t, env)).toBe(false);
    expect(verifyUnsubscribe(id, t.slice(0, -1) + (t.endsWith('A') ? 'B' : 'A'), env)).toBe(false);
    expect(verifyUnsubscribe(id, '', env)).toBe(false);
  });

  it('is worthless under a different secret, and invalid with none', () => {
    const t = unsubscribeSignature(id, env);
    expect(verifyUnsubscribe(id, t, { ...env, EMAIL_LINK_SECRET: 'y'.repeat(40) })).toBe(false);
    expect(verifyUnsubscribe(id, t, { APP_HOST: env.APP_HOST })).toBe(false);
    expect(() => unsubscribeSignature(id, { EMAIL_LINK_SECRET: 'short' })).toThrow(/EMAIL_LINK_SECRET/);
  });

  it('points at the app host from configuration', () => {
    expect(unsubscribePageUrl(id, env)).toMatch(/^http:\/\/app\.hordemart\.test\/unsubscribe\?u=/);
  });
});

describe('setup tips switch', () => {
  it('is off unless set to exactly "on"', () => {
    expect(nudgesEnabled({})).toBe(false);
    expect(nudgesEnabled({ REENGAGEMENT_EMAILS: 'true' })).toBe(false);
    expect(nudgesEnabled({ REENGAGEMENT_EMAILS: 'ON' })).toBe(false);
    expect(nudgesEnabled({ REENGAGEMENT_EMAILS: 'on' })).toBe(true);
  });
});
