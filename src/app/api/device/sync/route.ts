import { NextRequest, NextResponse } from 'next/server';
import { dbConnect } from '@/lib/db';
import { Device } from '@/models';
import { getDeviceToken } from '@/lib/auth';
import { devicePublic } from '@/lib/device';
import { parseUnitHealth, unitEventsOf } from '@/lib/unitHealth';

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

  // Firmware >= 2.9.18 appends the measurement unit's health; older firmware
  // sends nothing and gets exactly the old behaviour (lastSeenAt only).
  const unit = parseUnitHealth(req.nextUrl.searchParams);
  if (!unit) {
    await Device.updateOne({ _id: device._id }, { lastSeenAt: new Date() });
  } else {
    const events = unitEventsOf(unit);
    await Device.updateOne(
      { _id: device._id },
      {
        $set: { lastSeenAt: unit.at, unit },
        ...(events.length ? { $push: { unitEvents: { $each: events, $slice: -20 } } } : {}),
      }
    );
  }
  return NextResponse.json({ device: devicePublic(device) });
}
