import { NextRequest, NextResponse } from 'next/server';
import { dbConnect } from '@/lib/db';
import { RedeemCode } from '@/models';
import { getDeviceToken } from '@/lib/auth';
import { redeemSchema, applyCredits } from '@/lib/device';

// POST /api/device/redeem   (Authorization: Bearer <device token>)  { code }
// The device "Add tests" screen posts a code; a valid unused code grants credits.
export async function POST(req: NextRequest) {
  const tok = getDeviceToken(req);
  if (!tok) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = redeemSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'invalid code' }, { status: 400 });

  await dbConnect();

  // Atomically claim the code so it can't be redeemed twice.
  const claimed = await RedeemCode.findOneAndUpdate(
    { code: parsed.data.code, usedBy: null },
    { usedBy: tok.clinic, usedAt: new Date() },
    { new: true }
  );
  if (!claimed) return NextResponse.json({ error: 'code invalid or already used' }, { status: 400 });

  const balance = await applyCredits(tok.clinic, claimed.credits, 'redeem', { code: claimed.code });
  return NextResponse.json({ added: claimed.credits, credits: balance });
}
