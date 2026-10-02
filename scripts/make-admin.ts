#!/usr/bin/env node
/**
 * Give an existing HordeMart account platform-admin rights, or take them away.
 *
 *   npm run make-admin -- seller@example.com
 *   npm run make-admin -- seller@example.com --revoke
 *
 * Deliberately a script and not a screen: there is no web path that can make
 * someone an admin, so there is no web path to attack for it. The account
 * must already exist (sign up first).
 */

import mongoose from 'mongoose';
import { User } from '../src/lib/db/models/User';
import { describeUri } from './doctor';

async function main(): Promise<void> {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is not set');
  const email = process.argv.slice(2).find((arg) => !arg.startsWith('--'))?.trim().toLowerCase();
  if (!email) throw new Error('Usage: npm run make-admin -- someone@example.com [--revoke]');
  const revoke = process.argv.includes('--revoke');

  await mongoose.connect(uri, { serverSelectionTimeoutMS: 8_000 });
  const user = await User.findOneAndUpdate(
    { email },
    { $set: { platformRole: revoke ? 'user' : 'admin' } },
    { new: true },
  );
  if (!user) throw new Error(`No account with the email ${email} on ${describeUri(uri)}`);
  console.log(`${email} is ${revoke ? 'no longer' : 'now'} a platform admin on ${describeUri(uri)}.`);
  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error(error instanceof Error ? error.message : error);
  await mongoose.disconnect().catch(() => undefined);
  process.exit(1);
});
