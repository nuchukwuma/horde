/**
 * Starting points: fashion, food, electronics.
 *
 * Each preset is a full theme AND a starter page, so "reset to preset" gives a
 * seller a complete, readable store in one click. Every preset passes the
 * same validation a seller's own save does (tests/unit/design.test.ts).
 */

import type { Theme } from './theme';
import type { PageData } from './blocks';

export type PresetId = 'fashion' | 'food' | 'electronics';

export const PRESET_THEMES: Record<PresetId, Theme> = {
  fashion: {
    preset: 'fashion',
    colors: {
      background: '#fbf9f6',
      surface: '#ffffff',
      text: '#1c1a26',
      accent: '#22307a',
      accentText: '#ffffff',
    },
    fontPair: 'boutique',
    radius: 'soft',
    buttonStyle: 'pill',
    logo: null,
  },
  food: {
    preset: 'food',
    colors: {
      background: '#fff8f1',
      surface: '#ffffff',
      text: '#2a1a12',
      accent: '#b4472a',
      accentText: '#ffffff',
    },
    fontPair: 'friendly',
    radius: 'round',
    buttonStyle: 'solid',
    logo: null,
  },
  electronics: {
    preset: 'electronics',
    colors: {
      background: '#f5f7fa',
      surface: '#ffffff',
      text: '#0f1b2d',
      accent: '#0e5e6f',
      accentText: '#ffffff',
    },
    fontPair: 'tech',
    radius: 'none',
    buttonStyle: 'solid',
    logo: null,
  },
};

export function presetPage(preset: PresetId, storeName: string): PageData {
  const copy = {
    fashion: {
      bar: 'Free delivery within Lagos on orders over ₦50,000',
      heading: `New fabrics at ${storeName}`,
      sub: 'Adire, ankara and aso-oke, cut to order. Pay by card, transfer or USSD.',
      faq: [
        ['How long does delivery take?', '<p>Lagos orders arrive in 1–2 days. Other states take 3–5 days by courier.</p>'],
        ['Can I change my measurements after paying?', '<p>Yes — message us within 24 hours of your order.</p>'],
      ],
    },
    food: {
      bar: 'Orders before 2pm are delivered the same day',
      heading: `Fresh from ${storeName}'s kitchen`,
      sub: 'Trays for parties, drinks by the litre, spices by the pack. Pay online, we deliver.',
      faq: [
        ['How far do you deliver?', '<p>Anywhere on the mainland and the island. Delivery is charged at cost.</p>'],
        ['Can I order for an event?', '<p>Yes — order at least 48 hours ahead and send us your date in Messages.</p>'],
      ],
    },
    electronics: {
      bar: 'Every device is tested before dispatch',
      heading: `${storeName}: phones, chargers and accessories`,
      sub: 'Original stock with a 7-day return window. Pay securely through Paystack.',
      faq: [
        ['Are your products original?', '<p>Yes. Every item is sealed or tested, and we say which on the product page.</p>'],
        ['What if it stops working?', '<p>Message us within 7 days of delivery and we will replace or refund it.</p>'],
      ],
    },
  }[preset];

  return {
    root: { props: {} },
    content: [
      { type: 'AnnouncementBar', props: { id: `${preset}-bar`, text: copy.bar, href: '', tone: 'accent' } },
      {
        type: 'Hero',
        props: {
          id: `${preset}-hero`,
          heading: copy.heading,
          subheading: copy.sub,
          image: null,
          ctaLabel: 'Shop now',
          ctaHref: '/shop',
          align: 'left',
        },
      },
      { type: 'FeaturedProducts', props: { id: `${preset}-featured`, heading: 'New in', count: 6 } },
      {
        type: 'FAQ',
        props: {
          id: `${preset}-faq`,
          heading: 'Questions',
          items: copy.faq.map(([question, answer]) => ({ question, answer })),
        },
      },
    ] as PageData['content'],
  };
}
