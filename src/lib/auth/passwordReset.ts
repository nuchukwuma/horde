/**
 * "Forgot your password?" for sellers.
 *
 * request: always answers the same way, whether or not the address has an
 * account — otherwise this form tells anyone which emails are HordeMart
 * sellers. A link is emailed only when there is an account.
 *
 * consume: the link is single-use and short-lived (an hour). Setting the new
 * password signs the account out everywhere, because a reset is what you do
 * when you think someone else has your password.
 *
 * Tokens are 256 random bits stored only as a SHA-256 digest, like email
 * verification (VerificationToken). The link's host comes from APP_HOST,
 * never from the request: a reset link pointing at an attacker's server is
 * the classic way this feature is abused.
 */

import { User } from '../db/models/User';
import { VerificationToken } from '../db/models/VerificationToken';
import { ValidationError } from '../errors';
import { recordAudit } from '../audit';
import { assertEmailConfigured, sendEmail } from '../email/transport';
import { appOrigin } from '../seo/meta';
import { hashPassword } from './password';
import { revokeAllSessionsForUser } from './session';
import { generateVerificationToken, hashVerificationToken } from './emailVerification';

export const PASSWORD_RESET_TTL_MS = 1000 * 60 * 60; // 1 hour

export interface ResetContext {
  ip?: string;
  userAgent?: string;
}

/**
 * Email a reset link if the address has an account. Resolves the same way
 * either way; the route answers before telling the client anything else.
 */
export async function requestPasswordReset(email: string, context: ResetContext = {}): Promise<void> {
  // In production with no mail provider this throws before anything is
  // written, rather than telling the seller to check an inbox that will
  // never receive anything.
  assertEmailConfigured();

  const user = await User.findOne({ email: email.trim().toLowerCase() }).select('email name status');
  if (!user || user.status === 'suspended') return;

  const token = generateVerificationToken();

  // One live link at a time: an older one still lying in the inbox stops working.
  await VerificationToken.updateMany(
    { userId: user._id, purpose: 'password_reset', consumedAt: null },
    { $set: { consumedAt: new Date() } },
  );
  await VerificationToken.create({
    tokenHash: hashVerificationToken(token),
    userId: user._id,
    purpose: 'password_reset',
    email: user.email,
    expiresAt: new Date(Date.now() + PASSWORD_RESET_TTL_MS),
  });

  await recordAudit({
    action: 'user.password_reset.requested',
    actorUserId: user._id,
    targetType: 'User',
    targetId: String(user._id),
    ip: context.ip,
    userAgent: context.userAgent,
  });

  const link = `${appOrigin()}/reset-password?token=${encodeURIComponent(token)}`;
  await sendEmail({
    to: user.email,
    subject: 'Reset your HordeMart password',
    text: [
      `Hi ${user.name},`,
      '',
      'Someone — hopefully you — asked to reset the password for your HordeMart account. Choose a new one here:',
      '',
      link,
      '',
      'This link works once and expires in 1 hour. Resetting signs you out on every device.',
      '',
      'If you did not ask for this, ignore this email: your password has not changed.',
    ].join('\n'),
  });
}

const invalidLink = () =>
  new ValidationError('This reset link isn’t valid any more. It may have expired or been used. Ask for a new one.');

/** Set a new password from a reset link. Returns the user's email, for signing in. */
export async function resetPasswordWithToken(
  token: string,
  newPassword: string,
  context: ResetContext = {},
): Promise<{ email: string }> {
  if (!token) throw invalidLink();

  // Consume first, atomically: two clicks race to one winner, and a failure
  // after this point leaves a used link rather than a reusable one.
  const record = await VerificationToken.findOneAndUpdate(
    {
      tokenHash: hashVerificationToken(token),
      purpose: 'password_reset',
      consumedAt: null,
      expiresAt: { $gt: new Date() },
    },
    { $set: { consumedAt: new Date() } },
  );
  if (!record) throw invalidLink();

  const user = await User.findById(record.userId).select('email emailVerifiedAt');
  // The address changed after the link was sent: the old inbox no longer
  // speaks for this account.
  if (!user || user.email !== record.email) throw invalidLink();

  const passwordHash = await hashPassword(newPassword);
  // The address is proven too: only its owner could have opened this link.
  await User.updateOne(
    { _id: user._id },
    { $set: { passwordHash, emailVerifiedAt: user.emailVerifiedAt ?? new Date() } },
  );
  await revokeAllSessionsForUser(user._id);

  await recordAudit({
    action: 'user.password_reset.completed',
    actorUserId: user._id,
    targetType: 'User',
    targetId: String(user._id),
    ip: context.ip,
    userAgent: context.userAgent,
  });

  return { email: user.email };
}
