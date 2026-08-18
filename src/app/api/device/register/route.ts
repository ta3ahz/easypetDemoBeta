import { NextRequest, NextResponse } from 'next/server';
import { dbConnect } from '@/lib/db';
import { Device } from '@/models';
import { registerSchema, devicePublic, issueDeviceToken, applyCredits } from '@/lib/device';

// POST /api/device/register  { uid, fw? }
// A device auto-registers itself by its eFuse MAC on first online boot. Creates
// the Device record if new (status 'new', awaiting on-device setup), otherwise
// returns the existing one. Always returns a fresh device token.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'invalid body' }, { status: 400 });
  }
  const { uid, fw } = parsed.data;

  await dbConnect();
  let device = await Device.findOne({ uid });
  let created = false;
  if (!device) {
    device = await Device.create({ uid, fw: fw ?? '', status: 'new', lastSeenAt: new Date() });
    created = true;
    const bonus = Number(process.env.STARTER_CREDITS ?? 10);
    if (bonus > 0) {
      await applyCredits(String(device._id), bonus, 'signup_bonus');
      device = await Device.findById(device._id);
    }
  } else {
    await Device.updateOne({ _id: device._id }, { fw: fw ?? device.fw, lastSeenAt: new Date() });
  }
  if (!device) return NextResponse.json({ error: 'device error' }, { status: 500 });

  return NextResponse.json({
    created,
    token: issueDeviceToken(device),
    device: devicePublic(device),
  });
}
