/**
 * Email verification.
 *
 * Where the gate sits matters more than the mechanics. It is in front of
 * PAYOUT ONBOARDING, not in front of login:
 *
 *   - Blocking login on an unverified address strands any seller whose mail
 *     bounces, lands in spam, or arrives at a typo'd address. They cannot get
 *     in to fix the typo, which is the one thing that would help.
 *   - Blocking payout setup only delays the step where identity actually
 *     matters — the step that attaches a bank account and starts moving money.
 *
 * So an unverified seller can sign in, build their store, write posts, and
 * look around. They cannot connect a bank account until they prove the address.
 */

import { createHash, randomBytes } from 'node:crypto';
import { VerificationToken } from '../db/models/VerificationToken';
import { User, type UserAttributes } from '../db/models/User';
import { assertEmailConfigured, sendEmail, type SendResult } from '../email/transport';
import { ForbiddenError, ValidationError } from '../errors';

/**
 * Long enough to survive a slow inbox, short enough that a forwarded or
 * archived message stops being a credential.
 */
export const VERIFICATION_TTL_MS = 1000 * 60 * 60 * 24; // 24 hours

export function generateVerificationToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashVerificationToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export interface IssueVerificationInput {
  user: Pick<UserAttributes, '_id' | 'email' | 'name'>;
  /** Absolute base URL of the dashboard host, e.g. https://app.hordemart.com */
  appOrigin: string;
}

export async function issueEmailVerification(
  input: IssueVerificationInput,
): Promise<{ token: string; delivery: SendResult }> {
  // Fail before writing a token if we cannot actually deliver it. Otherwise a
  // production deploy missing RESEND_API_KEY tells every new seller to check an
  // inbox that will never receive anything.
  assertEmailConfigured();

  const token = generateVerificationToken();

  // Supersede any outstanding link. Two live tokens for one address means a
  // link the seller abandoned still works, which is a longer window than the
  // one they are currently looking at.
  await VerificationToken.updateMany(
    { userId: input.user._id, purpose: 'email', consumedAt: null },
    { $set: { consumedAt: new Date() } },
  );

  await VerificationToken.create({
    tokenHash: hashVerificationToken(token),
    userId: input.user._id,
    purpose: 'email',
    email: input.user.email,
    expiresAt: new Date(Date.now() + VERIFICATION_TTL_MS),
  });

  const link = `${input.appOrigin.replace(/\/$/, '')}/verify-email?token=${encodeURIComponent(token)}`;

  const delivery = await sendEmail({
    to: input.user.email,
    subject: 'Confirm your email for HordeMart',
    text: [
      `Hi ${input.user.name},`,
      '',
      'Confirm this address so you can connect a bank account and start taking payments:',
      '',
      link,
      '',
      'This link expires in 24 hours.',
      '',
      'If you did not create a HordeMart account, ignore this email — nothing was set up in your name.',
    ].join('\n'),
  });

  return { token, delivery };
}

/**
 * Consume a link.
 *
 * Every failure returns the same message. A distinct "expired" versus
 * "already used" versus "no such token" would let someone holding a stolen
 * link learn whether it is worth trying elsewhere.
 */
export async function consumeEmailVerification(token: string): Promise<UserAttributes> {
  const invalid = new ValidationError(
    'That verification link is not valid. Request a new one from your dashboard.',
  );

  if (!token) throw invalid;

  const record = await VerificationToken.findOne({
    tokenHash: hashVerificationToken(token),
    purpose: 'email',
    consumedAt: null,
    expiresAt: { $gt: new Date() },
  });

  if (!record) throw invalid;

  const user = await User.findById(record.userId);
  if (!user) throw invalid;

  // The address may have changed since the link was sent. Verifying the
  // current address from a link issued for a previous one would let someone
  // who briefly controlled the old address validate the new one.
  if (user.email !== record.email) throw invalid;

  // Consume first. If the update below fails, a retried link is refused rather
  // than granting a second attempt at whatever went wrong.
  const claimed = await VerificationToken.findOneAndUpdate(
    { _id: record._id, consumedAt: null },
    { $set: { consumedAt: new Date() } },
  );

  // Lost a race with a concurrent click.
  if (!claimed) throw invalid;

  const updated = await User.findByIdAndUpdate(
    user._id,
    { $set: { emailVerifiedAt: new Date() } },
    { new: true },
  );

  if (!updated) throw invalid;
  return updated;
}

export function isEmailVerified(user: Pick<UserAttributes, 'emailVerifiedAt'>): boolean {
  return Boolean(user.emailVerifiedAt);
}

/**
 * The gate. Throws rather than returning a boolean, so a forgotten `if` cannot
 * silently grant access — the same convention as lib/auth/guards.ts.
 */
export function assertEmailVerified(user: Pick<UserAttributes, 'emailVerifiedAt'>): void {
  if (!isEmailVerified(user)) {
    throw new ForbiddenError(
      'Confirm your email address before connecting a bank account.',
      'Confirm your email address before connecting a bank account. Check your inbox for our link.',
    );
  }
}
