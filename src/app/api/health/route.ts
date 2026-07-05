import { NextResponse } from 'next/server';
import { dbConnect } from '@/lib/db';

export const dynamic = 'force-dynamic';

// GET /api/health — Railway healthcheck + quick DB reachability probe.
export async function GET() {
  try {
    await dbConnect();
    return NextResponse.json({ ok: true, db: 'connected' });
  } catch {
    return NextResponse.json({ ok: false, db: 'unreachable' }, { status: 503 });
  }
}
