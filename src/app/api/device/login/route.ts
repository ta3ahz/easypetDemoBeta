import { NextRequest, NextResponse } from 'next/server';
import { dbConnect } from '@/lib/db';
import { Clinic, Device } from '@/models';
import { verifySecret } from '@/lib/auth';
import { loginSchema, clinicPublic, issueDeviceToken } from '@/lib/device';

// POST /api/device/login  { uid, clinicName, pin, fw? }
// Online login for an already-registered clinic (e.g. new device, or to refresh
// the device token). Offline fast-login is handled on-device against the NVS
// PIN hash; this endpoint is the online verification path.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'invalid body' }, { status: 400 });
  }
  const { uid, clinicName, pin, fw } = parsed.data;

  await dbConnect();

  const clinic = await Clinic.findOne({ name: clinicName });
  if (!clinic || !(await verifySecret(pin, clinic.pinHash))) {
    return NextResponse.json({ error: 'invalid clinic or PIN' }, { status: 401 });
  }
  if (clinic.status !== 'active') return NextResponse.json({ error: 'clinic suspended' }, { status: 403 });

  const device = await Device.findOneAndUpdate(
    { uid },
    { uid, clinic: clinic._id, fw: fw ?? '', lastSeenAt: new Date() },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );

  return NextResponse.json({ token: issueDeviceToken(device, clinic), clinic: clinicPublic(clinic) });
}
