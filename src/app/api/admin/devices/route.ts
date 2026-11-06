import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { Device, Test } from '@/models';
import { recoveryPin } from '@/lib/auth';
import { requireAdminApi, json } from '@/lib/adminApi';

export const dynamic = 'force-dynamic';

// A device pings the backend every ~30 s while online (same rule as the web panel).
const ONLINE_MS = 90_000;

// GET /api/admin/devices -> {devices}. Same fields the web Devices page shows.
export async function GET(req: NextRequest) {
  const admin = await requireAdminApi(req);
  if (admin instanceof NextResponse) return admin;

  const [devices, testCounts] = await Promise.all([
    Device.find().sort({ lastSeenAt: -1 }).lean(),
    Test.aggregate([{ $group: { _id: '$device', n: { $sum: 1 } } }]),
  ]);
  const counts = new Map(testCounts.map((t) => [String(t._id), t.n as number]));
  const now = Date.now();

  return json({
    devices: devices.map((d) => {
      const seen = d.lastSeenAt ? new Date(d.lastSeenAt).getTime() : 0;
      return {
        id: String(d._id),
        uid: d.uid,
        name: d.name || '',
        webUser: d.webUser || '',
        status: d.status,
        fw: d.fw || '',
        credits: d.credits ?? 0,
        config: d.config,
        vets: d.vets ?? [],
        tests: counts.get(String(d._id)) ?? 0,
        lastSeenAt: d.lastSeenAt ?? null,
        online: seen > 0 && now - seen < ONLINE_MS,
        recoveryPin: recoveryPin(d.uid),
        createdAt: d.createdAt,
      };
    }),
  });
}
