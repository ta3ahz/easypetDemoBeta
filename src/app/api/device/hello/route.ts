import { NextRequest, NextResponse } from 'next/server';
import { dbConnect } from '@/lib/db';
import { Clinic, Device } from '@/models';
import { uidSchema, clinicPublic, issueDeviceToken } from '@/lib/device';

// POST /api/device/hello  { uid }
// Called at boot: is this device (by eFuse MAC) already registered? If so, the
// device can skip the setup/registration screen. Returns a fresh device token
// + clinic info so a device that lost its stored token (NVS erased) recovers.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = uidSchema.safeParse(body?.uid);
  if (!parsed.success) return NextResponse.json({ error: 'invalid uid' }, { status: 400 });
  const uid = parsed.data;

  await dbConnect();
  const device = await Device.findOne({ uid });
  if (!device) return NextResponse.json({ registered: false });

  const clinic = await Clinic.findById(device.clinic);
  if (!clinic || clinic.status !== 'active') return NextResponse.json({ registered: false });

  await Device.updateOne({ _id: device._id }, { lastSeenAt: new Date() });
  return NextResponse.json({
    registered: true,
    token: issueDeviceToken(device, clinic),
    clinic: clinicPublic(clinic),
  });
}
