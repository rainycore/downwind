import { MongoClient, Db } from "mongodb";

// Singleton Mongo client. In dev, Next.js hot-reload would otherwise open a
// new connection on every edit, so we cache the promise on globalThis.
const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB ?? "downwind";

let clientPromise: Promise<MongoClient>;

declare global {
  // eslint-disable-next-line no-var
  var _downwindMongo: Promise<MongoClient> | undefined;
}

function connect(): Promise<MongoClient> {
  if (!uri) {
    throw new Error("MONGODB_URI is not set. Copy .env.example to .env.local.");
  }
  return new MongoClient(uri).connect();
}

if (process.env.NODE_ENV === "development") {
  if (!global._downwindMongo) global._downwindMongo = connect();
  clientPromise = global._downwindMongo;
} else {
  clientPromise = connect();
}

export async function getDb(): Promise<Db> {
  const client = await clientPromise;
  return client.db(dbName);
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
