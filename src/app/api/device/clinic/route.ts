import { NextRequest, NextResponse } from 'next/server';
import { dbConnect } from '@/lib/db';
import { Clinic } from '@/models';
import { getDeviceToken, hashSecret, pinVerifier } from '@/lib/auth';
import { clinicPublic } from '@/lib/device';

// PATCH /api/device/clinic   (Authorization: Bearer <device token>)
// Edit the clinic THIS device is bound to (by UID/token): rename, update vets,
// optionally change the PIN. Unlike registration this never creates a new clinic
// — the device stays linked to its existing account, so renaming just renames.
export async function PATCH(req: NextRequest) {
  const tok = getDeviceToken(req);
  if (!tok) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'invalid body' }, { status: 400 });

  await dbConnect();
  const clinic = await Clinic.findById(tok.clinic);
  if (!clinic) return NextResponse.json({ error: 'clinic not found' }, { status: 404 });
  if (clinic.status !== 'active') return NextResponse.json({ error: 'clinic suspended' }, { status: 403 });

  // Rename — the clinic name is also the web-login username, so keep it unique.
  if (typeof body.name === 'string') {
    const name = body.name.trim();
    if (name.length < 2) return NextResponse.json({ error: 'name too short' }, { status: 400 });
    if (name !== clinic.name) {
      const taken = await Clinic.findOne({ name, _id: { $ne: clinic._id } });
      if (taken) return NextResponse.json({ error: 'name already in use' }, { status: 409 });
      clinic.name = name;
    }
  }

  if (Array.isArray(body.vets)) {
    clinic.vets = body.vets.map((v: unknown) => String(v).trim()).filter(Boolean).slice(0, 3);
  }

  // Optional PIN change (device leaves the field blank to keep the current PIN).
  if (typeof body.pin === 'string' && body.pin.length > 0) {
    if (!/^\d{6}$/.test(body.pin)) return NextResponse.json({ error: 'PIN must be 6 digits' }, { status: 400 });
    clinic.pinHash = await hashSecret(body.pin);
    const v = pinVerifier(body.pin);
    clinic.pinSalt = v.pinSalt;
    clinic.pinCheck = v.pinCheck;
  }

  await clinic.save();
  return NextResponse.json({ clinic: clinicPublic(clinic) });
}
