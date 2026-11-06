import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { Test, Device } from '@/models';
import { requireAdminApi, json, isId } from '@/lib/adminApi';

export const dynamic = 'force-dynamic';

// GET /api/admin/measurements?limit=50&before=<testId>&device=<deviceId>&result=positive|negative
// -> {stats, tests, nextBefore}. Same data as the web /admin page, paginated (newest first).
export async function GET(req: NextRequest) {
  const admin = await requireAdminApi(req);
  if (admin instanceof NextResponse) return admin;

  const q = req.nextUrl.searchParams;
  const limit = Math.min(200, Math.max(1, Math.trunc(Number(q.get('limit')) || 50)));
  const filter: Record<string, unknown> = {};
  const before = q.get('before');
  if (before && isId(before)) filter._id = { $lt: before };
  const device = q.get('device');
  if (device && isId(device)) filter.device = device;
  const result = q.get('result');
  if (result === 'positive') filter['result.positive'] = true;
  else if (result === 'negative') filter['result.positive'] = { $ne: true };

  const [tests, totalTests, deviceCount, activeCount, posCount] = await Promise.all([
    Test.find(filter).sort({ _id: -1 }).limit(limit + 1).populate('device', 'uid name').lean(),
    Test.countDocuments(),
    Device.countDocuments(),
    Device.countDocuments({ status: 'active' }),
    Test.countDocuments({ 'result.positive': true }),
  ]);
  const page = tests.slice(0, limit);

  return json({
    stats: { measurements: totalTests, positive: posCount, devices: deviceCount, active: activeCount },
    tests: page.map((t) => {
      const dev = t.device as unknown as { _id?: unknown; uid?: string; name?: string } | null;
      return {
        id: String(t._id),
        date: (t.finishedAt ?? t.createdAt) as Date,
        device: dev ? { id: String(dev._id), uid: dev.uid ?? '', name: dev.name ?? '' } : null,
        vet: t.vet || '',
        patient: t.patient ?? null,
        i0: t.i0 ?? null,
        raw: t.raw ?? null,
        concentration: t.result?.value ?? null,
        temp: t.temp ?? null,
        positive: !!t.result?.positive,
      };
    }),
    nextBefore: tests.length > limit ? String(page[page.length - 1]._id) : null,
  });
}
