#!/usr/bin/env node
/**
 * Answer "why can't I log in?" without guessing.
 *
 *   npm run doctor
 *
 * The login endpoint is deliberately vague — an unknown address and a wrong
 * password return the same message, so it cannot be used to discover who has
 * an account. That is right for the endpoint and useless when you are the one
 * running the thing and have three 401s in a row.
 *
 * This prints the two facts that resolve almost every one of them:
 *
 *   1. WHICH DATABASE the app is actually connected to. Seeding one database
 *      and running the app against another produces a 401 that looks exactly
 *      like a wrong password, and switching between Atlas and a local mongod
 *      is how it usually happens.
 *   2. WHAT IS IN IT. Accounts, sites, and whether each account is active.
 *
 * It never prints a password, a hash, or the connection string. The URI
 * carries credentials, so only its host and database name are shown, and the
 * user projection excludes passwordHash explicitly as well as relying on the
 * schema's `select: false`.
 *
 * Read-only. It creates nothing and changes nothing.
 */

import mongoose from 'mongoose';
import { User } from '../src/lib/db/models/User';
import { Site } from '../src/lib/db/models/Site';
import { Membership } from '../src/lib/db/models/Membership';
import { Customer } from '../src/lib/db/models/Customer';
import '../src/lib/db/models/index';

/**
 * Host and database only.
 *
 * A connection string contains the password. Printing it into a terminal —
 * which is then pasted into a chat, a screenshot or an issue — is how
 * credentials leak, and rule 5 says secrets are never logged.
 */
export function describeUri(uri: string): string {
  try {
    const url = new URL(uri);
    const database = url.pathname.replace(/^\//, '') || '(none in the URI)';
    return `${url.protocol}//${url.hostname} database=${database}`;
  } catch {
    return '(unparseable URI)';
  }
}

async function main(): Promise<void> {
  const uri = process.env.MONGODB_URI;

  if (!uri) {
    console.error('MONGODB_URI is not set. Is .env.local present, and does it have the line?');
    process.exitCode = 1;
    return;
  }

  console.log(`Connecting to ${describeUri(uri)}`);

  await mongoose.connect(uri, { serverSelectionTimeoutMS: 8_000, bufferCommands: false });

  // The database the driver actually selected, which can differ from what you
  // think the URI said — a URI with no path lands in `test`.
  console.log(`Connected. Database in use: ${mongoose.connection.name}\n`);

  const users = await User.find({}).select('email status emailVerifiedAt lastLoginAt').lean();

  if (users.length === 0) {
    console.log('No accounts in this database.');
    console.log('That is the 401: the app is reading a database the seed did not write to.');
    console.log('Either point MONGODB_URI at the seeded database, or run: npm run seed\n');
  } else {
    console.log(`${users.length} account${users.length === 1 ? '' : 's'}:`);
    for (const user of users) {
      const flags = [
        user.status,
        user.emailVerifiedAt ? 'email verified' : 'email unverified',
      ];
      console.log(`  ${user.email}  [${flags.join(', ')}]`);
    }
    console.log(
      '\nIf your address is listed and active, the 401 is the password —' +
        ' login does not check email verification.',
    );
    console.log('The seeded account is ade@example.com / correct-horse-battery\n');
  }

  const sites = await Site.find({}).select('slug name status payout.status').lean();

  if (sites.length === 0) {
    console.log('No sites.');
  } else {
    console.log(`${sites.length} site${sites.length === 1 ? '' : 's'}:`);
    for (const site of sites) {
      console.log(`  ${site.slug}  "${site.name}"  [${site.status}, payout ${site.payout?.status}]`);
    }
  }

  const [memberships, customers] = await Promise.all([
    Membership.countDocuments({}),
    Customer.countDocuments({}),
  ]);

  console.log(`\n${memberships} membership(s), ${customers} shopper account(s).`);

  const hosts = [process.env.ROOT_DOMAIN, process.env.APP_HOST].filter(Boolean);
  if (hosts.length < 2) {
    console.log(
      '\nROOT_DOMAIN or APP_HOST is missing. Middleware returns 500 "Server misconfigured" without both.',
    );
  } else {
    console.log(`\nROOT_DOMAIN=${process.env.ROOT_DOMAIN}  APP_HOST=${process.env.APP_HOST}`);
    console.log('Each of these, and every seller subdomain, needs a line in your hosts file.');
  }
}

/**
 * Guarded so importing this module for a test does not connect to anything.
 */
const invokedDirectly =
  process.argv[1] !== undefined && process.argv[1].endsWith('doctor.ts');

if (invokedDirectly) {
  main()
  .catch((error) => {
    // Message only. A driver error can carry the connection string, and that
    // carries the password.
    console.error('Failed:', error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(async () => {
    if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
  });
}
