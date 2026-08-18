import { NextRequest, NextResponse } from 'next/server';
import { dbConnect } from '@/lib/db';
import { Device, Firmware } from '@/models';
import { getDeviceToken } from '@/lib/auth';

// a.b.c compare — is `a` a newer version than `b`?
function isNewer(a: string, b: string): boolean {
  const pa = a.split('.').map((n) => parseInt(n, 10) || 0);
  const pb = b.split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] || 0, y = pb[i] || 0;
    if (x !== y) return x > y;
  }
  return false;
}

// GET /api/device/ota   (Authorization: Bearer <device token>)
// The device's manual "Check for updates". Returns the active firmware release if
// it's newer than the device's own `fw`, otherwise { upToDate: true }.
export async function GET(req: NextRequest) {
  const tok = getDeviceToken(req);
  if (!tok) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  await dbConnect();
  const device = await Device.findById(tok.sub);
  if (!device) return NextResponse.json({ error: 'device not found' }, { status: 404 });
  await Device.updateOne({ _id: device._id }, { lastSeenAt: new Date() });

  const fw = await Firmware.findOne({ active: true }).lean();
  const current = device.fw || '';
  if (!fw || !isNewer(fw.version, current || '0.0.0')) {
    return NextResponse.json({ upToDate: true, current, latest: fw?.version ?? current });
  }
  return NextResponse.json({
    upToDate: false,
    current,
    version: fw.version,
    url: fw.url,
    sha256: fw.sha256 || '',
    notes: fw.notes || '',
  });
}
