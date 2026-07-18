import { MongoClient, Db } from "mongodb";

// Singleton Mongo client. In dev, Next.js hot-reload would otherwise open a
// new connection on every edit, so we cache the promise on globalThis.
declare global {
  var _downwindMongo: Promise<MongoClient> | undefined;
}

function connect(): Promise<MongoClient> {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error("MONGODB_URI is not set. Copy .env.example to .env.local.");
  }
  return new MongoClient(uri).connect();
}

// Lazy: don't touch env or open a socket until the first query. This keeps
// `next build` page-data collection from evaluating a connection at import.
// Don't cache a *rejected* connection promise: if the first connect fails
// (e.g. IP not yet allowlisted), clear the cache so the next call retries
// instead of replaying the failure until the process restarts.
function memo(existing: Promise<MongoClient> | undefined, set: (p: Promise<MongoClient> | undefined) => void): Promise<MongoClient> {
  if (existing) return existing;
  const p = connect().catch((err) => {
    set(undefined);
    throw err;
  });
  set(p);
  return p;
}

let _prod: Promise<MongoClient> | undefined;
function clientPromise(): Promise<MongoClient> {
  if (process.env.NODE_ENV === "development") {
    return memo(global._downwindMongo, (p) => (global._downwindMongo = p));
  }
  return memo(_prod, (p) => (_prod = p));
}

export async function getDb(): Promise<Db> {
  const client = await clientPromise();
  return client.db(process.env.MONGODB_DB ?? "downwind");
}

// Collection names used across the app.
export const COLLECTIONS = {
  /** Enacted climate/economic policies with embeddings + region metadata. */
  policies: "policies",
  /** Cached analysis results, keyed by a hash of the input policy text. */
  analyses: "analyses",
  /** Precomputed satellite indices (NDVI/NBR/AOD deltas) per region + window. */
  observations: "observations",
} as const;
