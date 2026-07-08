import { NextRequest, NextResponse } from 'next/server';
import { dbConnect } from '@/lib/db';
import { Clinic, Device } from '@/models';
import { hashSecret, verifySecret, pinVerifier } from '@/lib/auth';
import { registerSchema, clinicPublic, issueDeviceToken, applyCredits } from '@/lib/device';

// POST /api/device/register  { uid, clinicName, pin, vets?, fw? }
// Device "Setup" screen. Creates the clinic account on first use, or — if the
// clinic name already exists and the PIN matches — links this device to it
// (so a second device / re-setup uses the same "Save & continue" action).
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'invalid body' }, { status: 400 });
  }
  const { uid, clinicName, pin, vets, fw } = parsed.data;

  await dbConnect();

  let clinic = await Clinic.findOne({ name: clinicName });
  if (clinic) {
    // Existing account: authenticate with the PIN before linking the device.
    const ok = await verifySecret(pin, clinic.pinHash);
    if (!ok) return NextResponse.json({ error: 'clinic exists — wrong PIN' }, { status: 401 });
    if (clinic.status !== 'active') return NextResponse.json({ error: 'clinic suspended' }, { status: 403 });
    if (vets) { clinic.vets = vets; await clinic.save(); }
  } else {
    // New account.
    const pinHash = await hashSecret(pin);
    clinic = await Clinic.create({ name: clinicName, pinHash, ...pinVerifier(pin), vets: vets ?? [], credits: 0 });
    const bonus = Number(process.env.STARTER_CREDITS ?? 10);
    if (bonus > 0) await applyCredits(String(clinic._id), bonus, 'signup_bonus');
    clinic = await Clinic.findById(clinic._id);
  }
  if (!clinic) return NextResponse.json({ error: 'clinic error' }, { status: 500 });

  const device = await Device.findOneAndUpdate(
    { uid },
    { uid, clinic: clinic._id, fw: fw ?? '', lastSeenAt: new Date() },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );

  return NextResponse.json({ token: issueDeviceToken(device, clinic), clinic: clinicPublic(clinic), config: device.config });
}
