import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { Test } from '@/models';
import { requireAdminApi } from '@/lib/adminApi';

export const dynamic = 'force-dynamic';

function csvCell(v: unknown): string {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

// GET /api/admin/measurements/export — bearer-auth twin of /api/measurements/export
// (same columns, same 5000-row cap), for the mobile app's share sheet.
export async function GET(req: NextRequest) {
  const admin = await requireAdminApi(req);
  if (admin instanceof NextResponse) return admin;

  const tests = await Test.find().sort({ createdAt: -1 }).limit(5000).populate('device', 'uid name').lean();
  const header = ['date', 'device', 'deviceName', 'vet', 'patient', 'owner', 'species', 'sex', 'age', 'weight', 'i0', 'raw', 'concentration', 'temp', 'result', 'i0Used', 'i0Mode'];
  const rows = tests.map((t) => {
    const dev = t.device as unknown as { uid?: string; name?: string } | null;
    return [
      new Date(t.finishedAt ?? t.createdAt).toISOString(),
      dev?.uid ?? '',
      dev?.name ?? '',
      t.vet ?? '',
      t.patient?.name ?? '',
      t.patient?.owner ?? '',
      t.patient?.species ?? '',
      t.patient?.sex ?? '',
      t.patient?.age ?? '',
      t.patient?.weight ?? '',
      t.i0 ?? '',
      t.raw ?? '',
      t.result?.value ?? '',
      t.temp ?? '',
      t.result?.positive ? 'POSITIVE' : 'NEGATIVE',
      t.i0Used ?? '',
      t.i0Used != null ? (t.i0Fixed ? 'fixed' : 'blank') : '',
    ].map(csvCell).join(',');
  });

  return new NextResponse([header.join(','), ...rows].join('\n'), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="uribx-measurements.csv"',
      'Cache-Control': 'no-store',
    },
  });
}
