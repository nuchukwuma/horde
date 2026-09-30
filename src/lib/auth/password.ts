/**
 * Password hashing.
 *
 * argon2id via @node-rs/argon2: the pure-Rust binding avoids the native build
 * step that makes the reference argon2 package unreliable on serverless hosts.
 */

import { hash, verify, type Options } from '@node-rs/argon2';

/**
 * Argon2id. Spelled as a literal because @node-rs/argon2 exports `Algorithm` as
 * an ambient const enum, which cannot be read under isolatedModules — the mode
 * Next.js requires.
 */
const ARGON2ID = 2;

/** OWASP Password Storage Cheat Sheet baseline for argon2id. */
const HASH_OPTIONS: Options = {
  algorithm: ARGON2ID,
  memoryCost: 19_456, // KiB (19 MiB)
  timeCost: 2,
  parallelism: 1,
};

export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 200;

export async function hashPassword(plaintext: string): Promise<string> {
  if (plaintext.length < PASSWORD_MIN_LENGTH) {
    throw new Error(`Password must be at least ${PASSWORD_MIN_LENGTH} characters`);
  }
  // argon2 has no practical length ceiling, but an unbounded input is a cheap
  // way to burn CPU on a login endpoint.
  if (plaintext.length > PASSWORD_MAX_LENGTH) {
    throw new Error(`Password must be at most ${PASSWORD_MAX_LENGTH} characters`);
  }
  return hash(plaintext, HASH_OPTIONS);
}

/**
 * Never reveals why verification failed. A malformed stored hash and a wrong
 * password are both just `false`.
 */
export async function verifyPassword(storedHash: string, plaintext: string): Promise<boolean> {
  try {
    return await verify(storedHash, plaintext, HASH_OPTIONS);
  } catch {
    return false;
  }
}

/**
 * Burns roughly the same CPU as a real verification.
 *
 * Called when no user matches the submitted email, so that response timing does
 * not tell an attacker which addresses are registered.
 */
export async function fakeVerifyPassword(): Promise<false> {
  const decoy = '$argon2id$v=19$m=19456,t=2,p=1$c29tZXNhbHRzb21lc2FsdA$' +
    'J4moa2MP0/rMipOAkzWaq5rOcQZ1wLpVpFTQxJmDFFA';
  try {
    await verify(decoy, 'not-the-password', HASH_OPTIONS);
  } catch {
    // Expected. The point is the elapsed time, not the result.
  }
  return false;
}
