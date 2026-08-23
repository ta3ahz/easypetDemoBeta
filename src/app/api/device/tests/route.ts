import { NextRequest, NextResponse } from 'next/server';
import { dbConnect } from '@/lib/db';
import { Device, Test } from '@/models';
import { getDeviceToken } from '@/lib/auth';
import { testSchema, applyCredits } from '@/lib/device';

// POST /api/device/tests   (Authorization: Bearer <device token>)
//   { vet, patient, raw, temp, startedAt, finishedAt, clientId }
// The device sends the photometer's raw reading; the backend computes the result
// from this device's calibration:
//   concentration = log10(i0 / raw) * a + b ,  positive = concentration > ths
// The test is stored against the device and one credit is consumed. A clientId
// makes retried offline uploads idempotent (no double record / double charge).
export async function POST(req: NextRequest) {
  const tok = getDeviceToken(req);
  if (!tok) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = testSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'invalid body' }, { status: 400 });
  }

  await dbConnect();
  const device = await Device.findById(tok.sub);
  if (!device) return NextResponse.json({ error: 'device not found' }, { status: 404 });
  if (device.status === 'suspended') return NextResponse.json({ error: 'device suspended' }, { status: 403 });

  // Idempotency: an offline device may retry an upload it already delivered.
  const clientId = parsed.data.clientId ?? null;
  if (clientId) {
    const dup = await Test.findOne({ device: device._id, clientId }).lean();
    if (dup) {
      return NextResponse.json({
        id: String(dup._id),
        positive: dup.result?.positive ?? false,
        concentration: dup.result?.value ?? null,
        creditsUsed: dup.creditsUsed ?? 0,
        credits: device.credits,
        duplicate: true,
      });
    }
  }

  // The device measures a fresh blank baseline (I0) each test and sends it; use that
  // when present, falling back to the calibration's stored i0 only if it's missing.
  const { i0: cfgI0, a, b, ths } = device.config;
  const i0 = parsed.data.i0 && parsed.data.i0 > 0 ? parsed.data.i0 : cfgI0;
  const raw = parsed.data.raw ?? null;
  let concentration: number | null = null;
  let positive = parsed.data.result?.positive ?? false;
  if (raw && raw > 0 && i0 > 0) {
    concentration = Math.log10(i0 / raw) * a + b;
    positive = concentration > ths;
  }

  // Charge one credit; a null balance means there were none left -> reject the test
  // rather than recording it for free. The device also blocks this up front.
  const balance = await applyCredits(String(device._id), -1, 'test_consume');
  if (balance === null) return NextResponse.json({ error: 'no credits', credits: 0 }, { status: 402 });
  const creditsUsed = 1;

  let test;
  try {
    test = await Test.create({
      device: device._id,
      vet: parsed.data.vet ?? '',
      patient: parsed.data.patient ?? {},
      raw,
      i0: parsed.data.i0 ?? null,
      temp: parsed.data.temp ?? null,
      result: { positive, value: concentration },
      startedAt: parsed.data.startedAt ?? null,
      finishedAt: parsed.data.finishedAt ?? null,
      creditsUsed,
      clientId,
    });
  } catch (err: unknown) {
    // Lost the race against a concurrent identical upload: refund + return it.
    if (clientId && (err as { code?: number }).code === 11000) {
      if (balance !== null) await applyCredits(String(device._id), 1, 'test_dedupe_refund');
      const dup = await Test.findOne({ device: device._id, clientId }).lean();
      if (dup) {
        return NextResponse.json({
          id: String(dup._id),
          positive: dup.result?.positive ?? false,
          concentration: dup.result?.value ?? null,
          creditsUsed: dup.creditsUsed ?? 0,
          credits: device.credits,
          duplicate: true,
        });
      }
    }
    throw err;
  }
  await Device.updateOne({ _id: device._id }, { lastSeenAt: new Date() });

  return NextResponse.json({
    id: String(test._id),
    positive,
    concentration,
    creditsUsed,
    credits: balance === null ? device.credits : balance,
  });
}
