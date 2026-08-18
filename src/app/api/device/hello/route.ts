import { NextRequest, NextResponse } from 'next/server';
import { dbConnect } from '@/lib/db';
import { Device } from '@/models';
import { uidSchema, devicePublic, issueDeviceToken } from '@/lib/device';

// POST /api/device/hello  { uid }
// Boot check: is this device (by eFuse MAC) already set up? Returns registered
// (status 'active' = has a name + PIN) plus a fresh token + cached data, so a
// device that lost its stored token (NVS erased) recovers.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = uidSchema.safeParse(body?.uid);
  if (!parsed.success) return NextResponse.json({ error: 'invalid uid' }, { status: 400 });
  const uid = parsed.data;

  await dbConnect();
  const device = await Device.findOne({ uid });
  if (!device || device.status === 'suspended') return NextResponse.json({ registered: false });

  await Device.updateOne({ _id: device._id }, { lastSeenAt: new Date() });
  return NextResponse.json({
    registered: device.status === 'active',
    token: issueDeviceToken(device),
    device: devicePublic(device),
  });
}
