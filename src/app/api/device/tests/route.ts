import { NextRequest, NextResponse } from 'next/server';
import { dbConnect } from '@/lib/db';
import { Clinic, Device, Test } from '@/models';
import { getDeviceToken } from '@/lib/auth';
import { testSchema, applyCredits } from '@/lib/device';

// POST /api/device/tests   (Authorization: Bearer <device token>)
//   { vet, patient, raw, startedAt, finishedAt }
// The device sends the photometer's raw reading; the backend computes the
// concentration and positive/negative result using this device's calibration:
//   concentration = log10(i0 / raw) * a + b ,   positive = concentration > ths
// The test (patient + raw + result) is saved and one credit is consumed.
export async function POST(req: NextRequest) {
  const tok = getDeviceToken(req);
  if (!tok) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = testSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'invalid body' }, { status: 400 });
  }

  await dbConnect();
  const [clinic, device] = await Promise.all([
    Clinic.findById(tok.clinic),
    Device.findById(tok.sub),
  ]);
  if (!clinic || !device) return NextResponse.json({ error: 'not found' }, { status: 404 });

  // Compute concentration + result from the raw reading using the device config.
  const { i0, a, b, ths } = device.config;
  const raw = parsed.data.raw ?? null;
  let concentration: number | null = null;
  let positive = parsed.data.result?.positive ?? false;   // fallback if no raw sent
  if (raw && raw > 0) {
    concentration = Math.log10(i0 / raw) * a + b;
    positive = concentration > ths;
  }

  // Consume a credit if any remain; the test is recorded either way.
  const balance = await applyCredits(String(clinic._id), -1, 'test_consume');
  const creditsUsed = balance === null ? 0 : 1;

  const test = await Test.create({
    device: device._id,
    clinic: clinic._id,
    vet: parsed.data.vet ?? '',
    patient: parsed.data.patient ?? {},
    raw,
    result: { positive, value: concentration },
    startedAt: parsed.data.startedAt ?? null,
    finishedAt: parsed.data.finishedAt ?? null,
    creditsUsed,
  });
  await Device.updateOne({ _id: device._id }, { lastSeenAt: new Date() });

  return NextResponse.json({
    id: String(test._id),
    positive,
    concentration,
    creditsUsed,
    credits: balance === null ? clinic.credits : balance,
  });
}
