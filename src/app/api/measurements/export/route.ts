import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { dbConnect } from '@/lib/db';
import { Test } from '@/models';

export const dynamic = 'force-dynamic';

function csvCell(v: unknown): string {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

// GET /api/measurements/export — admin-only CSV of all measurements (full detail).
export async function GET() {
  const s = await getSession();
  if (!s || s.kind !== 'admin') return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  await dbConnect();
  const tests = await Test.find()
    .sort({ createdAt: -1 })
    .limit(5000)
    .populate('clinic', 'name')
    .populate('device', 'uid')
    .lean();

  const header = ['date', 'clinic', 'device', 'vet', 'patient', 'owner', 'species', 'sex', 'age', 'weight', 'raw', 'concentration', 'temp', 'result'];
  const rows = tests.map((t) =>
    [
      new Date(t.finishedAt ?? t.createdAt).toISOString(),
      (t.clinic as unknown as { name?: string })?.name ?? '',
      (t.device as unknown as { uid?: string })?.uid ?? '',
      t.vet ?? '',
      t.patient?.name ?? '',
      t.patient?.owner ?? '',
      t.patient?.species ?? '',
      t.patient?.sex ?? '',
      t.patient?.age ?? '',
      t.patient?.weight ?? '',
      t.raw ?? '',
      t.result?.value ?? '',
      t.temp ?? '',
      t.result?.positive ? 'POSITIVE' : 'NEGATIVE',
    ].map(csvCell).join(',')
  );
  const csv = [header.join(','), ...rows].join('\n');

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="uribx-measurements.csv"',
    },
  });
}
