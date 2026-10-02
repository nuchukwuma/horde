/**
 * npm run mrmouse:retry — send sale messages MrMouse has not confirmed yet.
 * The same work as /api/cron/mrmouse-sales, for a server's own crontab.
 */

import { connectToDatabase, disconnectFromDatabase } from '../src/lib/db/connect';
import '../src/lib/db/models/index';
import { retryDueMrMouseSales } from '../src/lib/integrations/mrmouseSales';

async function main() {
  await connectToDatabase();
  const result = await retryDueMrMouseSales({ limit: 500 });
  console.log(`MrMouse sales: ${result.attempted} attempted, ${result.delivered} delivered.`);
  await disconnectFromDatabase();
}

main().catch((error) => {
  console.error('mrmouse:retry failed:', error?.name ?? 'Error');
  process.exit(1);
});
