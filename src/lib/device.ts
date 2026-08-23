import { z } from 'zod';
import { signToken } from './auth';
import { Device, CreditTx, IDevice } from '@/models';

/* -------------------------- request validation --------------------------- */
export const uidSchema = z.string().trim().toUpperCase().regex(/^[0-9A-F]{6,24}$/, 'invalid uid');
export const pinSchema = z.string().regex(/^\d{4,6}$/, 'PIN must be 4-6 digits');

// Device auto-registers itself by UID on first online boot.
export const registerSchema = z.object({
  uid: uidSchema,
  fw: z.string().max(20).optional(),
});

// Device setup / edit (name + PIN, optional web credentials) — sent by the device.
export const setupSchema = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  pin: pinSchema.optional(),
  vets: z.array(z.string().trim().max(40)).max(3).optional(),
  webUser: z.string().trim().min(3).max(40).optional(),
  webPass: z.string().min(8).max(72).optional(),   // web-panel password: min 8 chars
  clearWeb: z.boolean().optional(),   // true = remove web credentials
});

// A measurement upload. Fields optional; the Mongoose schema supplies defaults.
export const testSchema = z.object({
  vet: z.string().max(40).optional(),
  raw: z.number().positive().optional(),
  i0: z.number().positive().optional(),   // per-test blank baseline measured on the device
  temp: z.number().optional(),
  patient: z
    .object({
      name: z.string().max(60).optional(),
      owner: z.string().max(60).optional(),
      species: z.string().max(20).optional(),
      sex: z.string().max(20).optional(),
      age: z.string().max(20).optional(),
      weight: z.string().max(20).optional(),
    })
    .optional(),
  result: z.object({ positive: z.boolean().optional(), value: z.number().nullable().optional() }).optional(),
  startedAt: z.coerce.date().nullable().optional(),
  finishedAt: z.coerce.date().nullable().optional(),
  clientId: z.string().max(40).optional(),
});

// Codes are "UBX-" + lowercase hex; the device sends that canonical form, so we
// only trim (no case-folding, which would break the lowercase body match).
export const redeemSchema = z.object({ code: z.string().trim().min(4).max(24) });

/* ------------------------------ payloads --------------------------------- */
// What the device caches for offline use after register/setup/sync.
export function devicePublic(device: IDevice) {
  return {
    id: String(device._id),
    uid: device.uid,
    name: device.name,
    status: device.status,
    credits: device.credits,
    vets: device.vets,
    config: device.config,
    pinSalt: device.pinSalt || '',   // device recomputes sha256(pinSalt+pin) to
    pinCheck: device.pinCheck || '', // validate the current PIN offline
    webUser: device.webUser || '',   // web-panel username (not secret; lets the device prefill it)
    hasWeb: !!device.webUser,        // whether web credentials are set
  };
}

export function issueDeviceToken(device: IDevice) {
  return signToken({ kind: 'device', sub: String(device._id), uid: device.uid });
}

/* ------------------------------- credits --------------------------------- */
export async function applyCredits(
  deviceId: string,
  delta: number,
  reason: 'admin_grant' | 'redeem' | 'test_consume' | 'signup_bonus' | 'test_dedupe_refund',
  meta?: Record<string, unknown>
): Promise<number | null> {
  const filter = delta < 0 ? { _id: deviceId, credits: { $gte: -delta } } : { _id: deviceId };
  const updated = await Device.findOneAndUpdate(filter, { $inc: { credits: delta } }, { new: true });
  if (!updated) return null;
  await CreditTx.create({ device: deviceId, delta, reason, meta });
  return updated.credits;
}
