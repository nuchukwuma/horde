/**
 * Cursor pagination and query parsing for the dashboard.
 *
 * The cursor tests matter because a malformed one must produce the first page,
 * never a 500. Cursors live in URLs, and URLs get truncated, shared and edited
 * by hand.
 */

import { describe, expect, it } from 'vitest';
import { Types } from 'mongoose';
import { decodeCursor, encodeCursor } from '../../src/lib/dashboard/seller';
import { parseDateRange, parseLimit } from '../../src/lib/http/query';

describe('cursor round-trip', () => {
  it('survives encode then decode', () => {
    const createdAt = new Date('2026-09-21T10:30:00.000Z');
    const id = new Types.ObjectId();

    const decoded = decodeCursor(encodeCursor({ createdAt, id }));

    expect(decoded?.createdAt.toISOString()).toBe(createdAt.toISOString());
    expect(String(decoded?.id)).toBe(String(id));
  });

  it('produces a URL-safe token', () => {
    const cursor = encodeCursor({ createdAt: new Date(), id: new Types.ObjectId() });
    expect(cursor).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('includes the id, because a timestamp alone is not unique', () => {
    // Two entries written in the same millisecond would otherwise straddle a
    // page boundary and one would be skipped.
    const createdAt = new Date('2026-09-21T10:30:00.000Z');
    const first = encodeCursor({ createdAt, id: new Types.ObjectId() });
    const second = encodeCursor({ createdAt, id: new Types.ObjectId() });

    expect(first).not.toBe(second);
  });
});

describe('a malformed cursor is a first page, not an error', () => {
  it.each([
    ['empty', ''],
    ['not base64', '!!!!'],
    ['base64 but not a cursor', Buffer.from('hello').toString('base64url')],
    ['missing the id', Buffer.from('2026-09-21T10:30:00.000Z|').toString('base64url')],
    ['a non-ObjectId id', Buffer.from('2026-09-21T10:30:00.000Z|nope').toString('base64url')],
    ['an invalid date', Buffer.from(`nonsense|${new Types.ObjectId()}`).toString('base64url')],
  ])('returns null for %s', (_label, cursor) => {
    expect(decodeCursor(cursor)).toBeNull();
  });

  it('never throws, whatever it is handed', () => {
    for (const input of ['', '\u0000', 'a'.repeat(10_000), '../../etc/passwd']) {
      expect(() => decodeCursor(input)).not.toThrow();
    }
  });
});

describe('date range parsing', () => {
  it('reads both bounds', () => {
    const range = parseDateRange(
      new URLSearchParams({ from: '2026-09-01', to: '2026-09-30' }),
    );
    expect(range.from?.toISOString()).toContain('2026-09-01');
    expect(range.to?.toISOString()).toContain('2026-09-30');
  });

  it('ignores an unparseable bound rather than erroring', () => {
    const range = parseDateRange(new URLSearchParams({ from: 'yesterday-ish' }));
    expect(range.from).toBeUndefined();
  });

  it('drops a backwards range instead of returning nothing', () => {
    // from > to would silently match zero rows, which reads as "you have no
    // sales" rather than "your filter is wrong".
    const range = parseDateRange(
      new URLSearchParams({ from: '2026-09-30', to: '2026-09-01' }),
    );
    expect(range.from).toBeDefined();
    expect(range.to).toBeUndefined();
  });

  it('returns an empty range when nothing is supplied', () => {
    expect(parseDateRange(new URLSearchParams())).toEqual({});
  });
});

describe('limit parsing', () => {
  it('uses the default when absent', () => {
    expect(parseLimit(new URLSearchParams())).toBe(50);
  });

  it('caps at the maximum, so a client cannot ask for everything', () => {
    expect(parseLimit(new URLSearchParams({ limit: '100000' }))).toBe(200);
  });

  it('falls back on nonsense rather than returning zero rows', () => {
    for (const limit of ['0', '-5', 'many', '']) {
      expect(parseLimit(new URLSearchParams({ limit }))).toBe(50);
    }
  });

  it('floors a fractional limit', () => {
    expect(parseLimit(new URLSearchParams({ limit: '10.9' }))).toBe(10);
  });
});
