import { NextRequest, NextResponse } from 'next/server';
import { dbConnect } from '@/lib/db';
import { Device, RedeemCode } from '@/models';
import { getDeviceToken } from '@/lib/auth';
import { redeemSchema, applyCredits } from '@/lib/device';

// POST /api/device/redeem   (Authorization: Bearer <device token>)   { code }
// Redeem a one-time code for test credits ("Add tests").
export async function POST(req: NextRequest) {
  const tok = getDeviceToken(req);
  if (!tok) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = redeemSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'invalid code' }, { status: 400 });

  await dbConnect();
  const device = await Device.findById(tok.sub);
  if (!device) return NextResponse.json({ error: 'device not found' }, { status: 404 });
  if (device.status === 'suspended') return NextResponse.json({ error: 'device suspended' }, { status: 403 });

  // Atomically claim the code (only if unused).
  const code = await RedeemCode.findOneAndUpdate(
    { code: parsed.data.code, usedByDevice: null },
    { usedByDevice: device._id, usedAt: new Date() },
    { new: true }
  );
  if (!code) return NextResponse.json({ error: 'invalid or already-used code' }, { status: 400 });

  const balance = await applyCredits(String(device._id), code.credits, 'redeem');
  return NextResponse.json({ credits: balance ?? device.credits, added: code.credits });
}
