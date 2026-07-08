import { NextRequest, NextResponse } from 'next/server';
import { dbConnect } from '@/lib/db';
import { Clinic, Device } from '@/models';
import { getDeviceToken } from '@/lib/auth';
import { clinicPublic } from '@/lib/device';

// GET /api/device/sync   (Authorization: Bearer <device token>)
// The device polls this to refresh clinic name, vets, the backend-controlled test
// credit balance, and its calibration config (so it can measure offline).
export async function GET(req: NextRequest) {
  const tok = getDeviceToken(req);
  if (!tok) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  await dbConnect();
  const [clinic, device] = await Promise.all([
    Clinic.findById(tok.clinic),
    Device.findById(tok.sub),
  ]);
  if (!clinic) return NextResponse.json({ error: 'clinic not found' }, { status: 404 });
  if (clinic.status !== 'active') return NextResponse.json({ error: 'clinic suspended' }, { status: 403 });

  await Device.updateOne({ _id: tok.sub }, { lastSeenAt: new Date() });
  return NextResponse.json({ clinic: clinicPublic(clinic), config: device?.config ?? null });
}
