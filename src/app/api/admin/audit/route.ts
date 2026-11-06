import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { AuditLog } from '@/models';
import { requireAdminApi, json } from '@/lib/adminApi';

export const dynamic = 'force-dynamic';

// GET /api/admin/audit -> {logs}. Latest 200, same as the web page.
export async function GET(req: NextRequest) {
  const admin = await requireAdminApi(req);
  if (admin instanceof NextResponse) return admin;

  const logs = await AuditLog.find().sort({ createdAt: -1 }).limit(200).lean();
  return json({
    logs: logs.map((l) => ({
      id: String(l._id),
      at: l.createdAt,
      actor: l.actor,
      action: l.action,
      target: l.target || '',
      detail: l.detail || '',
    })),
  });
}
