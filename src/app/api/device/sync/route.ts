import { NextRequest, NextResponse } from 'next/server';
import { dbConnect } from '@/lib/db';
import { Device } from '@/models';
import { getDeviceToken } from '@/lib/auth';
import { devicePublic } from '@/lib/device';

// GET /api/device/sync   (Authorization: Bearer <device token>)
// The device polls this to refresh its name, credit balance, calibration config,
// PIN verifier and vet labels (so it can measure + unlock offline).
export async function GET(req: NextRequest) {
  const tok = getDeviceToken(req);
  if (!tok) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  await dbConnect();
  const device = await Device.findById(tok.sub);
  if (!device) return NextResponse.json({ error: 'device not found' }, { status: 404 });
  if (device.status === 'suspended') return NextResponse.json({ error: 'device suspended' }, { status: 403 });

  await Device.updateOne({ _id: device._id }, { lastSeenAt: new Date() });
  return NextResponse.json({ device: devicePublic(device) });
}
