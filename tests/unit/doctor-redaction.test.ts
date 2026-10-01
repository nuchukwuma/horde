/**
 * The doctor prints a connection target. A connection string carries the
 * database password, and terminal output gets pasted into chats, screenshots
 * and issues — which is exactly how credentials leak.
 *
 * Rule 5 says secrets are never logged, so this asserts it rather than
 * trusting a reading of the function.
 */

import { describe, expect, it } from 'vitest';
import { describeUri } from '../../scripts/doctor';

describe('connection target redaction', () => {
  it('never echoes the password', () => {
    const shown = describeUri('mongodb://someuser:sup3rs3cret@db.example.com:27017/hordemart');
    expect(shown).not.toContain('sup3rs3cret');
    expect(shown).not.toContain('someuser');
  });

  it('never echoes credentials from an Atlas SRV string', () => {
    const shown = describeUri(
      'mongodb+srv://seller_db_user:Pa55w0rd@cluster0.abcde.mongodb.net/hordemart_seed?retryWrites=true',
    );
    expect(shown).not.toContain('Pa55w0rd');
    expect(shown).not.toContain('seller_db_user');
  });

  it('still shows the two things worth knowing: host and database', () => {
    const shown = describeUri('mongodb://user:pw@db.example.com:27017/hordemart_test');
    expect(shown).toContain('db.example.com');
    expect(shown).toContain('hordemart_test');
  });

  it('says so when the URI names no database, which lands you in `test`', () => {
    expect(describeUri('mongodb+srv://u:p@cluster0.abcde.mongodb.net/')).toContain('(none in the URI)');
  });

  it('does not throw on a malformed URI', () => {
    expect(describeUri('not a uri')).toBe('(unparseable URI)');
  });
});
