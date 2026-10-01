/**
 * Seller social links.
 *
 * Sellers store a HANDLE, not a URL, and we build the URL. That is the whole
 * security design here, and it is worth stating plainly because storing a URL
 * is the obvious thing to do and it is worse:
 *
 *   - A stored URL is attacker-controlled text rendered into an href. Even with
 *     a scheme allowlist, that is a validator standing between a seller and
 *     every visitor's browser, and validators of URLs have a long history of
 *     being bypassed (`java\nscript:`, `//evil.com`, unicode look-alikes,
 *     userinfo tricks like `https://instagram.com@evil.com`).
 *   - A handle is `[A-Za-z0-9._-]`, which cannot express a scheme, a host, or
 *     a path. There is nothing to bypass. We concatenate it onto a base we
 *     control.
 *
 * The one exception is `website`, where a seller legitimately needs an
 * arbitrary URL. That one is parsed with the URL constructor and restricted to
 * https, and it is the only field where the host is not ours to choose.
 */

import { z } from 'zod';

export type SocialPlatform =
  | 'instagram'
  | 'x'
  | 'facebook'
  | 'tiktok'
  | 'whatsapp'
  | 'youtube'
  | 'linkedin'
  | 'website';

interface PlatformSpec {
  label: string;
  /** Prefixed to the handle. Absent for `website`, which carries a full URL. */
  base?: string;
  /** What a seller types, for the form's placeholder. */
  hint: string;
}

export const SOCIAL_PLATFORMS: Record<SocialPlatform, PlatformSpec> = {
  instagram: { label: 'Instagram', base: 'https://instagram.com/', hint: 'yourhandle' },
  x: { label: 'X', base: 'https://x.com/', hint: 'yourhandle' },
  facebook: { label: 'Facebook', base: 'https://facebook.com/', hint: 'yourpage' },
  tiktok: { label: 'TikTok', base: 'https://tiktok.com/@', hint: 'yourhandle' },
  // Nigeria runs on WhatsApp, so this is the link sellers actually want. wa.me
  // takes an international number with no plus and no spaces.
  whatsapp: { label: 'WhatsApp', base: 'https://wa.me/', hint: '2348012345678' },
  youtube: { label: 'YouTube', base: 'https://youtube.com/@', hint: 'yourchannel' },
  linkedin: { label: 'LinkedIn', base: 'https://linkedin.com/in/', hint: 'yourprofile' },
  website: { label: 'Website', hint: 'https://example.com' },
};

/** Handles only. No scheme, no host, no path, no slashes. */
const HANDLE = /^[A-Za-z0-9._-]{1,64}$/;

/** WhatsApp needs digits: a handle-shaped value there would build a dead link. */
const PHONE_DIGITS = /^[0-9]{7,15}$/;

/** Each platform's own websites. Only links on these are cut down to a handle. */
const PLATFORM_HOSTS: Partial<Record<SocialPlatform, string[]>> = {
  instagram: ['instagram.com'],
  x: ['x.com', 'twitter.com'],
  facebook: ['facebook.com', 'fb.com'],
  tiktok: ['tiktok.com'],
  youtube: ['youtube.com'],
  linkedin: ['linkedin.com'],
};

/**
 * Turn what a seller pasted into a bare handle.
 *
 * Sellers copy their profile link from the app, which arrives as
 * "https://www.instagram.com/adetextiles/", "instagram.com/adetextiles" or a
 * share link carrying "?igsh=…". When — and only when — the link is on the
 * platform's own site, keep just the last part of its path (the handle; for
 * LinkedIn "/in/name", for YouTube "/@channel") and drop the rest. Anything
 * else comes back untouched, so a link to some other site still fails the
 * handle pattern below rather than being quietly accepted.
 */
function extractHandle(raw: string, platform: SocialPlatform): string {
  const value = raw.trim();
  const hosts = PLATFORM_HOSTS[platform] ?? [];
  if (/^(https?:\/\/)?([a-z0-9-]+\.)+[a-z]{2,}(\/|$)/i.test(value)) {
    try {
      const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
      const host = url.hostname.toLowerCase().replace(/^(www|m|mobile|web)\./, '');
      if (hosts.includes(host)) {
        const last = url.pathname.split('/').filter(Boolean).pop() ?? '';
        return last.replace(/^@/, '');
      }
    } catch {
      // Not a URL after all: fall through and let the pattern decide.
    }
  }
  return value.replace(/^@/, '');
}

function handleFor(platform: SocialPlatform) {
  return z
    .string()
    .trim()
    .transform((value) => extractHandle(value, platform))
    .refine((value) => value !== 'profile.php', 'Use your page’s username (facebook.com/yourpage), not a profile.php link')
    .refine((value) => HANDLE.test(value), 'Use just your handle, without the full link');
}

/**
 * WhatsApp wants the full international number. Spaces, "+" and dashes are
 * dropped; a Nigerian number written the local way (0801 234 5678) gains
 * its 234 country code, because wa.me cannot dial a local number.
 */
export function normaliseWhatsAppNumber(value: string): string {
  const digits = value.replace(/[^0-9]/g, '');
  return /^0[789][01][0-9]{8}$/.test(digits) ? `234${digits.slice(1)}` : digits;
}

const whatsappSchema = z
  .string()
  .trim()
  .refine((value) => /^[0-9\s+().-]*$/.test(value), 'Enter the number in full, like 2348012345678')
  .transform(normaliseWhatsAppNumber)
  .refine((value) => PHONE_DIGITS.test(value), 'Enter the number in full, like 2348012345678');

export const socialWebsiteSchema = z
  .string()
  .trim()
  .max(2048)
  .superRefine((value, ctx) => {
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Enter a full address, like https://example.com' });
      return;
    }
    // https only. http would be downgraded by the CSP anyway, and every other
    // scheme — javascript:, data:, mailto: — has no business in a link we
    // render for visitors.
    if (url.protocol !== 'https:') {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'The address must start with https://' });
    }
    // `https://instagram.com@evil.com` parses with host evil.com. Refusing
    // userinfo entirely removes a whole class of look-alike link.
    if (url.username || url.password) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'That address is not valid' });
    }
  });

export const socialsSchema = z
  .object({
    instagram: handleFor('instagram').optional(),
    x: handleFor('x').optional(),
    facebook: handleFor('facebook').optional(),
    tiktok: handleFor('tiktok').optional(),
    whatsapp: whatsappSchema.optional(),
    youtube: handleFor('youtube').optional(),
    linkedin: handleFor('linkedin').optional(),
    website: socialWebsiteSchema.optional(),
  })
  .strict();

export type Socials = z.infer<typeof socialsSchema>;

export interface SocialLink {
  platform: SocialPlatform;
  label: string;
  href: string;
  /** What to show: the handle, or the hostname for a website. */
  text: string;
}

/**
 * Turn stored handles into links for rendering.
 *
 * Pure and total: anything that does not produce a well-formed link is dropped
 * rather than rendered broken. A stored value that somehow escaped validation
 * (an older row, a manual edit) cannot reach an href through here, because a
 * handle failing the pattern is skipped.
 */
export function buildSocialLinks(socials: Socials | null | undefined): SocialLink[] {
  if (!socials) return [];

  const links: SocialLink[] = [];

  for (const [key, spec] of Object.entries(SOCIAL_PLATFORMS) as [
    SocialPlatform,
    PlatformSpec,
  ][]) {
    const value = socials[key];
    if (!value) continue;

    if (key === 'website') {
      try {
        const url = new URL(value);
        if (url.protocol !== 'https:' || url.username || url.password) continue;
        links.push({
          platform: key,
          label: spec.label,
          href: url.toString(),
          text: url.hostname.replace(/^www\./, ''),
        });
      } catch {
        continue;
      }
      continue;
    }

    const valid = key === 'whatsapp' ? PHONE_DIGITS.test(value) : HANDLE.test(value);
    if (!valid || !spec.base) continue;

    links.push({
      platform: key,
      label: spec.label,
      href: `${spec.base}${value}`,
      text: key === 'whatsapp' ? `+${value}` : `@${value}`,
    });
  }

  return links;
}
