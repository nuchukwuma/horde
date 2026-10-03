/**
 * The one follow-up for a seller who signed up but never confirmed their
 * email.
 *
 * Exactly one, ever. A seller who ignored two emails is telling us something,
 * and a third starts to look like spam to them and to Gmail. The reminder is
 * transactional — it finishes a signup they started — so it carries no
 * unsubscribe link, and it is not gated by REENGAGEMENT_EMAILS.
 *
 * Window: accounts between 24 hours and 7 days old. Under a day, the first
 * email may simply not have been read yet. Over a week, the address was
 * probably mistyped or abandoned, and turning this feature on must not mail
 * every stale account in the database at once.
 *
 * Claimed before sending: `verificationReminderSentAt` is set by an atomic
 * update that only matches if it is still null, so two overlapping cron runs
 * cannot both send. A failed send releases the claim for the next run.
 */

import { User } from '../db/models/User';
import { assertEmailConfigured } from './transport';
import { issueEmailVerification } from '../auth/emailVerification';
import { appOrigin } from '../seo/meta';

export const REMINDER_AFTER_MS = 1000 * 60 * 60 * 24; // 1 day
export const REMINDER_WINDOW_MS = 1000 * 60 * 60 * 24 * 7; // 7 days

export interface ReminderResult {
  candidates: number;
  sent: number;
  failed: number;
}

export async function sendVerificationReminders(
  options: { now?: Date; limit?: number } = {},
): Promise<ReminderResult> {
  const now = options.now ?? new Date();
  const limit = Math.min(Math.max(options.limit ?? 100, 1), 500);

  // In production with no mail provider, stop before claiming anyone: a
  // claim with nothing sent would use up their one reminder.
  assertEmailConfigured();

  const candidates = await User.find({
    emailVerifiedAt: null,
    verificationReminderSentAt: null,
    status: 'active',
    createdAt: {
      $lte: new Date(now.getTime() - REMINDER_AFTER_MS),
      $gte: new Date(now.getTime() - REMINDER_WINDOW_MS),
    },
  })
    .select('_id')
    .sort({ createdAt: 1 })
    .limit(limit)
    .lean();

  let sent = 0;
  let failed = 0;

  for (const candidate of candidates) {
    const claimed = await User.findOneAndUpdate(
      { _id: candidate._id, emailVerifiedAt: null, verificationReminderSentAt: null },
      { $set: { verificationReminderSentAt: now } },
      { new: true },
    ).select('email name');
    if (!claimed) continue; // another run got there, or they verified meanwhile

    try {
      await issueEmailVerification({ user: claimed, appOrigin: appOrigin(), variant: 'reminder' });
      sent += 1;
    } catch {
      failed += 1;
      await User.updateOne(
        { _id: claimed._id, verificationReminderSentAt: now },
        { $set: { verificationReminderSentAt: null } },
      );
      // The id only: the address is personal data and the error may carry it.
      console.error('[email] verification reminder failed', String(claimed._id));
    }
  }

  return { candidates: candidates.length, sent, failed };
}
