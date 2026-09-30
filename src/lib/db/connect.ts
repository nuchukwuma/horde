/**
 * Serverless-safe Mongoose connection.
 *
 * Each warm Lambda keeps its own module scope, and a cold start that opens a new
 * pool every invocation exhausts the Atlas connection limit under load. The cache
 * is hung off globalThis so it survives the module re-evaluation that happens
 * across hot reloads in dev and across handler invocations in production.
 */

import mongoose, { type Mongoose } from 'mongoose';

interface ConnectionCache {
  connection: Mongoose | null;
  promise: Promise<Mongoose> | null;
}

declare global {
  var __hordemartMongoose: ConnectionCache | undefined;
}

const cache: ConnectionCache = globalThis.__hordemartMongoose ?? {
  connection: null,
  promise: null,
};
globalThis.__hordemartMongoose = cache;

export async function connectToDatabase(uri = process.env.MONGODB_URI): Promise<Mongoose> {
  if (cache.connection) return cache.connection;

  if (!uri) {
    throw new Error('MONGODB_URI is not configured');
  }

  if (!cache.promise) {
    cache.promise = mongoose.connect(uri, {
      // Queue-and-fail rather than buffer indefinitely: a hung request that
      // eventually times out is far easier to diagnose than one that never returns.
      bufferCommands: false,
      maxPoolSize: 10,
      minPoolSize: 0,
      serverSelectionTimeoutMS: 10_000,
      socketTimeoutMS: 45_000,
      // Writes must be acknowledged by a majority before we report success.
      // A payment recorded on a primary that then loses an election is a
      // reconciliation incident.
      writeConcern: { w: 'majority' },
      retryWrites: true,
    });
  }

  try {
    cache.connection = await cache.promise;
  } catch (error) {
    cache.promise = null;
    throw error;
  }

  return cache.connection;
}

export async function disconnectFromDatabase(): Promise<void> {
  if (cache.connection) {
    await cache.connection.disconnect();
  }
  cache.connection = null;
  cache.promise = null;
}
