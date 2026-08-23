import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { dbConnect } from '@/lib/db';
import { Device } from '@/models';
import { getDeviceToken } from '@/lib/auth';

// POST /api/device/calibrate   (Authorization: Bearer <device token>)
//   { i0, a, b, ths? }
// The device ran an on-device calibration (9 standards) and computed its own
// i0/a/b for concentration = log10(i0/raw)*a + b. This writes those into the
// device's stored calibration so both the device and the backend use the same
// values. ths (the positive/negative cutoff) is left to the admin unless sent.
const calibSchema = z.object({
  i0: z.number().positive(),
  a: z.number(),
  b: z.number(),
  ths: z.number().optional(),
});

export async function POST(req: NextRequest) {
  const tok = getDeviceToken(req);
  if (!tok) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = calibSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'invalid body' }, { status: 400 });
  }

  await dbConnect();
  const device = await Device.findById(tok.sub);
  if (!device) return NextResponse.json({ error: 'device not found' }, { status: 404 });
  if (device.status === 'suspended') return NextResponse.json({ error: 'device suspended' }, { status: 403 });

  const set: Record<string, unknown> = {
    'config.i0': parsed.data.i0,
    'config.a': parsed.data.a,
    'config.b': parsed.data.b,
    lastSeenAt: new Date(),
  };
  if (parsed.data.ths != null) set['config.ths'] = parsed.data.ths;
  await Device.updateOne({ _id: device._id }, { $set: set });

  const ths = parsed.data.ths ?? device.config.ths;
  return NextResponse.json({ ok: true, config: { i0: parsed.data.i0, a: parsed.data.a, b: parsed.data.b, ths } });
}
