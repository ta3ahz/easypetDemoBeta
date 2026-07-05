import { NextResponse } from 'next/server';
import { dbConnect } from '@/lib/db';

export const dynamic = 'force-dynamic';

// GET /api/health — Railway healthcheck.
// Always returns 200 if the app process is serving; DB reachability is reported
// as informational only (with a short cap) so a DB/env misconfig doesn't block
// the deploy from going live — you can still reach the app to diagnose it.
export async function GET() {
  let db = 'unknown';
  try {
    await Promise.race([
      dbConnect().then(() => {
        db = 'connected';
      }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 2500)),
    ]);
  } catch {
    db = 'unreachable';
  }
  return NextResponse.json({ ok: true, db });
}
