#!/usr/bin/env node
/**
 * Bring a database's indexes in line with the models.
 *
 *   npm run sync-indexes            # show what would change
 *   npm run sync-indexes -- --apply # change it
 *
 * Needed once on any database created before Site.customDomain's index was
 * fixed: the old `customDomain_1` (unique + sparse) index treats every store
 * without a custom domain as a duplicate, so only one store can ever sign up.
 * Mongoose will not drop an index by itself; this does, for indexes no model
 * declares any more, and builds the ones that are missing.
 */

import mongoose from 'mongoose';
import '../src/lib/db/models/index';
import { describeUri } from './doctor';

async function main(): Promise<void> {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is not set');
  const apply = process.argv.includes('--apply');

  console.log(`${apply ? 'Syncing' : 'Checking'} indexes on ${describeUri(uri)}`);
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 8_000 });

  for (const model of Object.values(mongoose.models)) {
    const diff = await model.diffIndexes();
    if (diff.toDrop.length === 0 && diff.toCreate.length === 0) continue;
    console.log(`${model.modelName}: drop ${JSON.stringify(diff.toDrop)} create ${JSON.stringify(diff.toCreate)}`);
    if (apply) await model.syncIndexes();
  }

  console.log(apply ? 'Done.' : 'Nothing changed. Re-run with --apply to make these changes.');
}

main()
  .catch((error) => {
    console.error('Failed:', error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
