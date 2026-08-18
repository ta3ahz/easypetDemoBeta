import { NextRequest, NextResponse } from 'next/server';
import { dbConnect } from '@/lib/db';
import { Device } from '@/models';
import { getDeviceToken, hashSecret, pinVerifier } from '@/lib/auth';
import { setupSchema, devicePublic } from '@/lib/device';

// PATCH /api/device/setup   (Authorization: Bearer <device token>)
//   { name?, pin?, vets?, webUser?, webPass?, clearWeb? }
// The device configures itself: display name, touchscreen PIN, optional web-panel
// credentials. Setting a name + PIN flips status 'new' -> 'active'. This is the
// only place a device's account details are defined (no separate clinic).
export async function PATCH(req: NextRequest) {
  const tok = getDeviceToken(req);
  if (!tok) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = setupSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'invalid body' }, { status: 400 });
  }
  const d = parsed.data;

  await dbConnect();
  const device = await Device.findById(tok.sub);
  if (!device) return NextResponse.json({ error: 'device not found' }, { status: 404 });
  if (device.status === 'suspended') return NextResponse.json({ error: 'device suspended' }, { status: 403 });

  if (d.name !== undefined) device.name = d.name;
  if (d.pin !== undefined) {
    const v = pinVerifier(d.pin);
    device.pinSalt = v.pinSalt;
    device.pinCheck = v.pinCheck;
  }
  if (Array.isArray(d.vets)) device.vets = d.vets.map((v) => v.trim()).filter(Boolean).slice(0, 3);

  // Optional web credentials
  if (d.clearWeb) {
    device.webUser = null;
    device.webPassHash = null;
  } else if (d.webUser !== undefined || d.webPass !== undefined) {
    if (d.webUser) {
      const taken = await Device.findOne({ webUser: d.webUser, _id: { $ne: device._id } });
      if (taken) return NextResponse.json({ error: 'username already in use' }, { status: 409 });
      device.webUser = d.webUser;
    }
    if (d.webPass) device.webPassHash = await hashSecret(d.webPass);
  }

  // A named + PIN'd device is fully set up.
  if (device.name && device.pinCheck && device.status === 'new') device.status = 'active';
  device.lastSeenAt = new Date();
  await device.save();

  return NextResponse.json({ device: devicePublic(device) });
}
