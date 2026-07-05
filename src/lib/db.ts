import mongoose from 'mongoose';

// Cached connection so Next.js hot-reload / serverless invocations reuse one
// pool instead of opening a new connection on every request.
const MONGODB_URI = process.env.MONGODB_URI;

interface Cached {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const globalForMongoose = global as any;
const cached: Cached = globalForMongoose._mongoose ?? { conn: null, promise: null };
globalForMongoose._mongoose = cached;

export async function dbConnect(): Promise<typeof mongoose> {
  if (cached.conn) return cached.conn;
  if (!MONGODB_URI) {
    throw new Error('MONGODB_URI is not set. Add it to .env.local (see .env.example).');
  }
  if (!cached.promise) {
    cached.promise = mongoose
      .connect(MONGODB_URI, { bufferCommands: false, serverSelectionTimeoutMS: 8000 })
      .catch((err) => {
        cached.promise = null; // let the next request retry instead of caching a rejection
        throw err;
      });
  }
  cached.conn = await cached.promise;
  return cached.conn;
}
