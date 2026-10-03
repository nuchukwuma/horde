/**
 * npm run emails:send — the verification reminder and (when switched on)
 * setup tips. The same work as /api/cron/emails, for a server's own crontab.
 * Run it hourly.
 */

import { connectToDatabase, disconnectFromDatabase } from '../src/lib/db/connect';
import '../src/lib/db/models/index';
import { sendVerificationReminders } from '../src/lib/email/reminders';
import { sendNudges } from '../src/lib/email/nudges';

async function main() {
  await connectToDatabase();
  const reminders = await sendVerificationReminders({ limit: 500 });
  console.log(`Verification reminders: ${reminders.sent} sent, ${reminders.failed} failed.`);
  const nudges = await sendNudges({ limit: 500 });
  console.log(
    nudges.enabled
      ? `Setup tips: ${nudges.sent} sent, ${nudges.failed} failed.`
      : 'Setup tips: off (REENGAGEMENT_EMAILS is not "on").',
  );
  await disconnectFromDatabase();
}

main().catch((error) => {
  console.error('emails:send failed:', error?.name ?? 'Error');
  process.exit(1);
});
