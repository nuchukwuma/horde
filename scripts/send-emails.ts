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
  let failed = false;
  // Independent jobs: one failing must not stop the other.
  try {
    const reminders = await sendVerificationReminders({ limit: 500 });
    console.log(`Verification reminders: ${reminders.sent} sent, ${reminders.failed} failed.`);
  } catch (error) {
    failed = true;
    console.error('Verification reminders failed:', (error as { code?: string })?.code ?? 'Error');
  }
  try {
    const nudges = await sendNudges({ limit: 500 });
    console.log(
      nudges.enabled
        ? `Setup tips: ${nudges.sent} sent, ${nudges.failed} failed.`
        : 'Setup tips: off (REENGAGEMENT_EMAILS is not "on").',
    );
  } catch (error) {
    failed = true;
    console.error('Setup tips failed:', (error as { code?: string })?.code ?? 'Error');
  }
  await disconnectFromDatabase();
  if (failed) process.exit(1);
}

main().catch((error) => {
  console.error('emails:send failed:', error?.name ?? 'Error');
  process.exit(1);
});
