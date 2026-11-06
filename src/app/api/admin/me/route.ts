import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { requireAdminApi, json } from '@/lib/adminApi';

export const dynamic = 'force-dynamic';

// GET /api/admin/me -> {email} (token check for the app on launch)
export async function GET(req: NextRequest) {
  const admin = await requireAdminApi(req);
  if (admin instanceof NextResponse) return admin;
  return json({ email: admin.email });
}
