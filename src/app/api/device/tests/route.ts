import { NextRequest, NextResponse } from 'next/server';
import { dbConnect } from '@/lib/db';
import { Clinic, Device, Test } from '@/models';
import { getDeviceToken } from '@/lib/auth';
import { testSchema, applyCredits } from '@/lib/device';

// POST /api/device/tests   (Authorization: Bearer <device token>)  { vet, patient, result, startedAt, finishedAt }
// Record a completed measurement and consume one credit. Tests done offline are
// queued on-device and posted here (possibly in a batch of single calls) once
// the link is back.
export async function POST(req: NextRequest) {
  const tok = getDeviceToken(req);
  if (!tok) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = testSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'invalid body' }, { status: 400 });
  }

  await dbConnect();
  const clinic = await Clinic.findById(tok.clinic);
  if (!clinic) return NextResponse.json({ error: 'clinic not found' }, { status: 404 });

  // Consume a credit if any remain; the test is still recorded either way so a
  // measurement is never lost (device gates on credits before starting).
  const balance = await applyCredits(String(clinic._id), -1, 'test_consume');
  const creditsUsed = balance === null ? 0 : 1;

  const test = await Test.create({
    device: tok.sub,
    clinic: clinic._id,
    vet: parsed.data.vet ?? '',
    patient: parsed.data.patient ?? {},
    result: parsed.data.result ?? {},
    startedAt: parsed.data.startedAt ?? null,
    finishedAt: parsed.data.finishedAt ?? null,
    creditsUsed,
  });
  await Device.updateOne({ _id: tok.sub }, { lastSeenAt: new Date() });

  return NextResponse.json({
    id: String(test._id),
    creditsUsed,
    credits: balance === null ? clinic.credits : balance,
  });
}
