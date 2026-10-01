/**
 * The page-layout data a seller saves from the Puck editor, validated.
 *
 * Puck stores a page as JSON: `{ root, content: [{ type, props }], zones }`.
 * That JSON comes from the seller's browser, so it is untrusted input and
 * gets the same treatment as any other request body:
 *
 *   - ALLOW-LIST of block types. Exactly eight, all ours. There is no raw
 *     HTML block, no script block, no iframe/embed block — not disabled, not
 *     present. An unknown `type` fails validation.
 *   - STRICT props. Every block's props are a closed zod object: an extra key
 *     (a smuggled `dangerouslySetInnerHTML`, a `style`, an `onClick`) fails.
 *   - LINKS are internal paths only ("/shop", "/shop/adire-wrap"). A scheme,
 *     a protocol-relative "//evil.com", or a backslash trick fails.
 *   - IMAGES must be on our Cloudinary account in this store's own folder
 *     (checked in the service against server configuration).
 *   - RICH TEXT (FAQ answers, image+text body) is passed through DOMPurify
 *     with a short allow-list on every save; nothing else is HTML.
 *   - SIZE is capped before parsing (MAX_PAGE_BYTES) and per field.
 *   - Puck's `zones` (nested drop areas) are refused: the blocks here do not
 *     render zones, and data a block does not render is data nobody reviews.
 */

import { z } from 'zod';
import DOMPurify from 'isomorphic-dompurify';
import { designImageSchema } from './theme';
import { ValidationError } from '../errors';

export const MAX_PAGE_BYTES = 64 * 1024;
export const MAX_BLOCKS = 30;

/**
 * A link inside the store. Starts with exactly one "/", then URL-safe path
 * and query characters. No scheme, no host, no backslash, no whitespace.
 */
export const internalPath = z
  .string()
  .trim()
  .max(200)
  .regex(/^\/(?![/\\])[A-Za-z0-9\-._~/?=&%+]*$/, 'Links must point inside your store, like /shop');

const plain = (max: number) =>
  z
    .string()
    .max(max)
    // Plain-text fields render as React text (escaped), so markup in them is
    // harmless — but storing it invites a future render path that isn't.
    .transform((value) => value.replace(/[<>]/g, ''));

/** Rich text from Puck's editor: a handful of inline and list tags, safe links. */
export function sanitizeBlockRichText(dirty: string): string {
  return DOMPurify.sanitize(dirty, {
    ALLOWED_TAGS: ['p', 'br', 'strong', 'b', 'em', 'i', 'u', 'ul', 'ol', 'li', 'a'],
    ALLOWED_ATTR: ['href'],
    ALLOWED_URI_REGEXP: /^(?:https:|mailto:|tel:|\/(?![/\\]))/i,
    ALLOW_DATA_ATTR: false,
    ALLOW_UNKNOWN_PROTOCOLS: false,
  });
}

const richText = (max: number) => z.string().max(max * 2).transform(sanitizeBlockRichText).pipe(z.string().max(max));

const id = z.string().min(1).max(80);
const optionalImage = designImageSchema.nullable().default(null);

export const BLOCK_SCHEMAS = {
  AnnouncementBar: z
    .object({
      id,
      text: plain(140),
      href: internalPath.or(z.literal('')).default(''),
      tone: z.enum(['accent', 'dark', 'soft']).default('accent'),
    })
    .strict(),

  Hero: z
    .object({
      id,
      heading: plain(90),
      subheading: plain(240).default(''),
      image: optionalImage,
      ctaLabel: plain(32).default('Shop now'),
      ctaHref: internalPath.default('/shop'),
      align: z.enum(['left', 'center']).default('left'),
    })
    .strict(),

  FeaturedProducts: z
    .object({
      id,
      heading: plain(80).default('New in'),
      count: z.union([z.literal(3), z.literal(6), z.literal(9)]).default(6),
    })
    .strict(),

  CategoryGrid: z
    .object({
      id,
      heading: plain(80).default('Shop by category'),
      tiles: z
        .array(
          z
            .object({
              label: plain(40),
              href: internalPath.default('/shop'),
              image: optionalImage,
            })
            .strict(),
        )
        .max(8)
        .default([]),
    })
    .strict(),

  Testimonials: z
    .object({
      id,
      heading: plain(80).default('What customers say'),
      items: z
        .array(
          z
            .object({
              quote: plain(280),
              name: plain(60),
              location: plain(60).default(''),
            })
            .strict(),
        )
        .max(6)
        .default([]),
    })
    .strict(),

  ImageText: z
    .object({
      id,
      heading: plain(90),
      body: richText(4000).default(''),
      image: optionalImage,
      imageSide: z.enum(['left', 'right']).default('left'),
    })
    .strict(),

  FAQ: z
    .object({
      id,
      heading: plain(80).default('Questions'),
      items: z
        .array(
          z
            .object({
              question: plain(160),
              answer: richText(2000),
            })
            .strict(),
        )
        .max(12)
        .default([]),
    })
    .strict(),

  ContactWhatsApp: z
    .object({
      id,
      heading: plain(80).default('Order on WhatsApp'),
      text: plain(240).default(''),
      // International format without "+": 2348012345678. wa.me builds the link.
      phone: z.string().trim().regex(/^[0-9]{7,15}$/, 'Use digits only, like 2348012345678'),
      prefill: plain(160).default(''),
      buttonLabel: plain(32).default('Chat on WhatsApp'),
    })
    .strict(),
} as const;

export type BlockType = keyof typeof BLOCK_SCHEMAS;
export const BLOCK_TYPES = Object.keys(BLOCK_SCHEMAS) as [BlockType, ...BlockType[]];

const blockSchema = z.discriminatedUnion(
  'type',
  BLOCK_TYPES.map((type) =>
    z.object({ type: z.literal(type), props: BLOCK_SCHEMAS[type] }).strict(),
  ) as unknown as [
    z.ZodDiscriminatedUnionOption<'type'>,
    ...z.ZodDiscriminatedUnionOption<'type'>[],
  ],
);

export const pageSchema = z
  .object({
    root: z
      .object({
        props: z.object({ title: plain(80).optional() }).strict().default({}),
      })
      .strict()
      .default({ props: {} }),
    content: z.array(blockSchema).max(MAX_BLOCKS, `A page can have at most ${MAX_BLOCKS} blocks`),
    // Nested drop areas are not used by any block; accept only "none".
    zones: z.record(z.array(z.never())).optional(),
  })
  .strict();

export type PageData = z.infer<typeof pageSchema>;

export const EMPTY_PAGE: PageData = { root: { props: {} }, content: [] };

/**
 * Size-check, then validate and sanitise a page. Throws ValidationError with
 * the first problem's path, so the editor can say which block is wrong.
 */
export function parsePageData(raw: unknown): PageData {
  const bytes = Buffer.byteLength(JSON.stringify(raw ?? null), 'utf8');
  if (bytes > MAX_PAGE_BYTES) {
    throw new ValidationError(`This page is too large to save (${Math.ceil(bytes / 1024)} KB, limit ${MAX_PAGE_BYTES / 1024} KB)`);
  }

  const result = pageSchema.safeParse(raw);
  if (!result.success) {
    const issue = result.error.issues[0];
    throw new ValidationError(`Page layout rejected: ${issue?.message ?? 'invalid'} at ${issue?.path.join('.') ?? 'page'}`, {
      issues: result.error.issues.slice(0, 5).map((entry) => ({ path: entry.path, message: entry.message })),
    });
  }
  return result.data as PageData;
}

/** Every image a page references, for the ownership check. */
export function pageImages(page: PageData): Array<z.infer<typeof designImageSchema>> {
  const images: Array<z.infer<typeof designImageSchema>> = [];
  for (const block of page.content as Array<{ type: string; props: Record<string, unknown> }>) {
    const props = block.props;
    if (props.image) images.push(props.image as z.infer<typeof designImageSchema>);
    if (Array.isArray(props.tiles)) {
      for (const tile of props.tiles as Array<{ image?: z.infer<typeof designImageSchema> | null }>) {
        if (tile.image) images.push(tile.image);
      }
    }
  }
  return images;
}
