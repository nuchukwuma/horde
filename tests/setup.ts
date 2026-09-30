/**
 * Test bootstrap.
 *
 * Unit suites need no database: Mongoose runs query middleware and document
 * validators before it ever talks to a server, which is exactly where the
 * tenant-scope and append-only guarantees live. Integration suites connect only
 * when MONGODB_TEST_URI is set.
 */

import { afterAll, afterEach, beforeAll } from 'vitest';
import mongoose from 'mongoose';
import { TEST_MONGO_URI, hasMongo } from './helpers/mongo';

// Registers every model so that `ref` resolution and index creation work.
import '../src/lib/db/models/index';

// Host configuration the SEO helpers require. They throw without it by design.
process.env.ROOT_DOMAIN ??= 'hordemart.com';
process.env.APP_HOST ??= 'app.hordemart.com';

beforeAll(async () => {
  if (!hasMongo) return;

  await mongoose.connect(TEST_MONGO_URI, { bufferCommands: false });
  await Promise.all(Object.values(mongoose.models).map((model) => model.createIndexes()));
});

afterEach(async () => {
  if (!hasMongo || mongoose.connection.readyState !== 1) return;

  const { collections } = mongoose.connection;
  await Promise.all(Object.values(collections).map((c) => c.deleteMany({})));
});

afterAll(async () => {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
});
