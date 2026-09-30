/**
 * Mongoose adds these when a schema sets `timestamps`, but nothing tells
 * TypeScript that. Declaring them on the attribute interfaces means reads are
 * correctly typed instead of needing a cast at every call site — and a cast
 * would be asserting something the type system could have known.
 */

export interface Timestamps {
  createdAt: Date;
  updatedAt: Date;
}

/** For append-only collections, which set `updatedAt: false`. */
export interface CreatedAt {
  createdAt: Date;
}
