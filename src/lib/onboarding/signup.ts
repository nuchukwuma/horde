/**
 * Seller signup: the account, the site, and the link between them.
 *
 * Three documents have to appear together — a User with no Site cannot do
 * anything, and a Site with no Membership is unreachable by its own owner. We
 * do not use a multi-document transaction for this: nothing else in the
 * codebase does (a standalone mongod has no transactions, which is what most
 * people run locally), and the unique indexes are the real correctness
 * guarantee under concurrency. Instead the writes are ordered so that the
 * cheapest-to-undo happens last, and a failure part-way compensates by
 * deleting only the ids this call created.
 *
 * What this does NOT do is verify the email address. There is no mail
 * transport in the project yet, so `emailVerifiedAt` stays null and nothing
 * currently reads it. Before launch that gate belongs in front of payout
 * onboarding — see the note at the bottom of this file.
 */

import { Types } from 'mongoose';
import { User } from '../db/models/User';
import { Site, type SiteAttributes } from '../db/models/Site';
import { Membership } from '../db/models/Membership';
import { SlugHistory } from '../db/models/SlugHistory';
import { hashPassword } from '../auth/password';
import { ConflictError } from '../errors';
import { recordAudit } from '../audit';
import { runWithoutTenantScope } from '../tenant/context';

export interface SellerSignUpInput {
  email: string;
  password: string;
  name: string;
  siteName: string;
  slug: string;
  ip?: string;
  userAgent?: string;
}

export interface SellerSignUpResult {
  userId: Types.ObjectId;
  siteId: Types.ObjectId;
  slug: string;
}

/** Mongo's duplicate-key code. Distinguishes a race from a real failure. */
const DUPLICATE_KEY = 11000;

function isDuplicateKeyError(error: unknown): error is { code: number; keyPattern?: object } {
  return typeof error === 'object' && error !== null && 'code' in error &&
    (error as { code?: unknown }).code === DUPLICATE_KEY;
}

/**
 * True when the slug is free and allowed.
 *
 * Reserved-name rejection happens in `slugSchema` before this is reached, so a
 * false here means "taken", not "forbidden". Store slugs are public — they are
 * hostnames — so answering this question leaks nothing that a DNS lookup would
 * not.
 */
export async function isSlugAvailable(slug: string): Promise<boolean> {
  const existing = await runWithoutTenantScope(
    'checking Site slug availability before signup, which spans no single tenant',
    () => Site.findOne({ slug }).select('_id'),
  );
  if (existing) return false;
  // An address a store used to have stays retired forever — see
  // models/SlugHistory.ts for why reusing one would be a phishing kit.
  const retired = await SlugHistory.exists({ slug });
  return !retired;
}

export async function signUpSeller(input: SellerSignUpInput): Promise<SellerSignUpResult> {
  // Pre-checks exist for the error message, not for correctness. The unique
  // indexes below are what actually prevent a duplicate under a race.
  await assertEmailFree(input.email);
  await assertSlugFree(input.slug);

  const passwordHash = await hashPassword(input.password);

  let userId: Types.ObjectId | null = null;
  let siteId: Types.ObjectId | null = null;

  try {
    const user = await User.create({
      email: input.email,
      passwordHash,
      name: input.name,
      platformRole: 'user',
      status: 'active',
      emailVerifiedAt: null,
    });
    userId = user._id;

    const site = await runWithoutTenantScope(
      'creating a Site, which is the tenant root and so precedes any tenant scope',
      () =>
        Site.create({
          slug: input.slug,
          name: input.siteName,
          ownerId: user._id,
          planCode: 'free',
          status: 'active',
          // Store on by default; the other modules are opt-in from settings.
          modules: { store: true, portfolio: false, blog: false },
          payout: { status: 'unset' },
        }),
    ) as SiteAttributes;
    siteId = site._id;

    await Membership.create({
      userId: user._id,
      siteId: site._id,
      role: 'owner',
      // An owner's authority comes from the role, not from a permission list.
      // Leaving this empty keeps "owner" from being silently downgraded by an
      // incomplete array.
      permissions: [],
      acceptedAt: new Date(),
    });

    await recordAudit({
      action: 'site.created',
      siteId: site._id,
      actorUserId: user._id,
      actorRole: 'owner',
      targetType: 'Site',
      targetId: String(site._id),
      after: { slug: site.slug, name: site.name },
      ip: input.ip,
      userAgent: input.userAgent,
    });

    return { userId: user._id, siteId: site._id, slug: site.slug };
  } catch (error) {
    // Undo in reverse order, and only ids this call created. A half-built
    // seller is worse than a failed signup: they can log in and find nothing.
    await rollback(userId, siteId);

    if (isDuplicateKeyError(error)) {
      // Lost a race between the pre-check and the insert.
      throw new ConflictError('That email or subdomain was just taken. Try again.');
    }
    throw error;
  }
}

async function rollback(
  userId: Types.ObjectId | null,
  siteId: Types.ObjectId | null,
): Promise<void> {
  try {
    if (siteId) {
      await runWithoutTenantScope(
        'rolling back a partially created Site after a failed signup',
        () => Site.deleteOne({ _id: siteId }),
      );
    }
    if (userId) await User.deleteOne({ _id: userId });
  } catch {
    // A failed rollback must not mask the original error, which is the one
    // that explains what went wrong. The orphan is visible to reconciliation.
  }
}

async function assertEmailFree(email: string): Promise<void> {
  const existing = await User.findOne({ email }).select('_id');
  if (existing) {
    // This does reveal that an address has an account. Unlike the login
    // endpoint — which is deliberately vague — a signup form cannot both be
    // usable and hide this: "we sent you an email" with no account created
    // leaves a real person stuck with no way to proceed. The honest message is
    // the lesser harm for a seller-facing form, and the rate limit blocks
    // bulk enumeration. Revisit if we ever add mail: the privacy-preserving
    // flow needs a transport to send "someone tried to sign up as you".
    throw new ConflictError('An account with that email already exists.', { field: 'email' });
  }
}

async function assertSlugFree(slug: string): Promise<void> {
  if (!(await isSlugAvailable(slug))) {
    throw new ConflictError(`The address ${slug} is already taken.`, { field: 'slug' });
  }
}

/**
 * TODO before launch: email verification.
 *
 * Needs a mail transport (Resend is in the stack but unbuilt). The gate should
 * sit in front of payout onboarding rather than login — blocking login on an
 * unverified address strands sellers whose verification mail bounces, while
 * blocking payout setup only delays the step where identity actually matters.
 */
