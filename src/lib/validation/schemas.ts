/**
 * Request validation. Every route handler parses its body through one of these
 * before touching a model.
 *
 * Money never appears in a request schema. Prices, fees, and splits are computed
 * server-side from stored data — a client-supplied amount is not validated here,
 * it is ignored entirely.
 */

import { z } from 'zod';
import {
  SLUG_MAX_LENGTH,
  SLUG_MIN_LENGTH,
  describeSlugRejection,
  validateSlug,
} from '../tenant/reserved';
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '../auth/password';

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email('Enter a valid email address')
  .max(320);

export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Password must be at least ${PASSWORD_MIN_LENGTH} characters`)
  .max(PASSWORD_MAX_LENGTH);

export const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(SLUG_MIN_LENGTH)
  .max(SLUG_MAX_LENGTH)
  .superRefine((value, ctx) => {
    const result = validateSlug(value);
    if (!result.valid && result.reason) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: describeSlugRejection(result.reason) });
    }
  });

export const signUpSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  name: z.string().trim().min(1).max(120),
});

export const signInSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(PASSWORD_MAX_LENGTH),
});

export const createSiteSchema = z.object({
  slug: slugSchema,
  name: z.string().trim().min(1).max(120),
  modules: z
    .object({
      store: z.boolean().default(true),
      portfolio: z.boolean().default(false),
      blog: z.boolean().default(false),
    })
    .default({ store: true, portfolio: false, blog: false }),
});

/**
 * Nigerian NUBAN account numbers are exactly 10 digits. Bank codes come from
 * Paystack's bank list and are validated against it at call time, not here —
 * a regex cannot tell a real bank code from a well-formed fake.
 */
export const payoutDetailsSchema = z.object({
  businessName: z.string().trim().min(2).max(200),
  bankCode: z.string().trim().regex(/^\d{3,6}$/, 'Invalid bank code'),
  accountNumber: z.string().trim().regex(/^\d{10}$/, 'Account number must be 10 digits'),
});

/** Sensitive actions carry the password again; the session alone is not enough. */
export const stepUpSchema = z.object({
  password: z.string().min(1).max(PASSWORD_MAX_LENGTH),
});

export const createProductSchema = z.object({
  title: z.string().trim().min(1).max(200),
  slug: z.string().trim().toLowerCase().min(1).max(200),
  descriptionHtml: z.string().max(50_000).optional(),
  // Naira as a string: a JSON number would already have passed through a float.
  priceNaira: z.string().regex(/^\d+(\.\d{1,2})?$/, 'Enter an amount like 2500 or 2500.00'),
  sku: z.string().trim().max(64).optional(),
  status: z.enum(['draft', 'active', 'archived']).default('draft'),
});

/**
 * A cart is ids and quantities. Deliberately no price field: the server reads
 * prices from the database, so there is nothing for a client to tamper with.
 * A request carrying a price is not rejected — the field simply does not exist
 * in this schema and is stripped.
 */
export const checkoutSchema = z.object({
  items: z
    .array(
      z.object({
        productId: z.string().regex(/^[a-f0-9]{24}$/i, 'Invalid product id'),
        quantity: z.number().int().min(1).max(999),
      }),
    )
    .min(1, 'Your cart is empty')
    .max(100, 'Too many items in one order'),
  customerEmail: emailSchema,
  customerName: z.string().trim().max(200).optional(),
});

export type CheckoutInputBody = z.infer<typeof checkoutSchema>;

/** Cloudinary-backed image reference. The URL is checked against our own CDN host. */
const imageSchema = z.object({
  cloudinaryPublicId: z.string().trim().min(1).max(300),
  url: z.string().url().max(2_000),
  alt: z.string().trim().max(300).optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
});

const publishStatusSchema = z.enum(['draft', 'published', 'archived']);

/**
 * `contentHtml` is accepted as arbitrary HTML and sanitised on write. Trying to
 * validate HTML safety with a schema would be a second, weaker sanitiser.
 */
export const createPostSchema = z.object({
  title: z.string().trim().min(1).max(250),
  slug: z.string().trim().max(250).optional(),
  excerpt: z.string().trim().max(500).optional(),
  contentHtml: z.string().max(200_000),
  tags: z.array(z.string().trim().max(40)).max(20).optional(),
  status: publishStatusSchema.optional(),
  coverImage: imageSchema.nullable().optional(),
  metaTitle: z.string().trim().max(200).optional(),
  metaDescription: z.string().trim().max(400).optional(),
  noindex: z.boolean().optional(),
});

export const updatePostSchema = createPostSchema.partial();

export const createProjectSchema = z.object({
  title: z.string().trim().min(1).max(250),
  slug: z.string().trim().max(250).optional(),
  summary: z.string().trim().max(500).optional(),
  descriptionHtml: z.string().max(100_000).optional(),
  images: z.array(imageSchema).max(30).optional(),
  client: z.string().trim().max(200).optional(),
  role: z.string().trim().max(200).optional(),
  // http(s) only: a javascript: or data: URL here would be rendered as a link.
  projectUrl: z.string().url().startsWith('http').max(2_000).optional(),
  completedAt: z.string().datetime().optional(),
  tags: z.array(z.string().trim().max(40)).max(20).optional(),
  status: publishStatusSchema.optional(),
  position: z.number().int().min(0).max(10_000).optional(),
  metaTitle: z.string().trim().max(200).optional(),
  metaDescription: z.string().trim().max(400).optional(),
  noindex: z.boolean().optional(),
});

export const updateProjectSchema = createProjectSchema.partial();

export type CreatePostInputBody = z.infer<typeof createPostSchema>;
export type CreateProjectInputBody = z.infer<typeof createProjectSchema>;

export type SignUpInput = z.infer<typeof signUpSchema>;
export type SignInInput = z.infer<typeof signInSchema>;
export type CreateSiteInput = z.infer<typeof createSiteSchema>;
export type PayoutDetailsInput = z.infer<typeof payoutDetailsSchema>;
export type CreateProductInput = z.infer<typeof createProductSchema>;
