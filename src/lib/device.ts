import { z } from 'zod';
import { signToken } from './auth';
import { Clinic, CreditTx, IClinic, IDevice } from '@/models';

/* -------------------------- request validation --------------------------- */
export const uidSchema = z.string().trim().toUpperCase().regex(/^[0-9A-F]{6,24}$/, 'invalid uid');
export const pinSchema = z.string().regex(/^\d{6}$/, 'PIN must be 6 digits');
export const clinicNameSchema = z.string().trim().min(2).max(60);

export const registerSchema = z.object({
  uid: uidSchema,
  clinicName: clinicNameSchema,
  pin: pinSchema,
  vets: z.array(z.string().trim().max(40)).max(3).optional(),
  fw: z.string().max(20).optional(),
});

export const loginSchema = z.object({
  uid: uidSchema,
  clinicName: clinicNameSchema,
  pin: pinSchema,
  fw: z.string().max(20).optional(),
});

// Fields are optional; the Mongoose Test schema supplies defaults for anything
// omitted (avoids zod nested-default typing quirks).
export const testSchema = z.object({
  vet: z.string().max(40).optional(),
  raw: z.number().positive().optional(),             // photometer reading; backend computes result
  temp: z.number().optional(),                       // chamber temperature (°C) at measurement
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
  result: z
    .object({
      positive: z.boolean().optional(),
      value: z.number().nullable().optional(),
    })
    .optional(),
  startedAt: z.coerce.date().nullable().optional(),
  finishedAt: z.coerce.date().nullable().optional(),
});

export const redeemSchema = z.object({ code: z.string().trim().toUpperCase().min(4).max(24) });

/* ------------------------------ payloads --------------------------------- */
// What the device caches for offline use after register/login/sync.
export function clinicPublic(clinic: IClinic) {
  return {
    id: String(clinic._id),
    name: clinic.name,
    vets: clinic.vets,
    credits: clinic.credits,
    status: clinic.status,
  };
}

export function issueDeviceToken(device: IDevice, clinic: IClinic) {
  return signToken(
    { kind: 'device', sub: String(device._id), uid: device.uid, clinic: String(clinic._id) },
    '365d'
  );
}

/* ------------------------------- credits --------------------------------- */
// Atomically move credits and record the ledger entry. Returns the new balance,
// or null if `delta` is negative and the clinic lacks enough credits.
export async function applyCredits(
  clinicId: string,
  delta: number,
  reason: 'admin_grant' | 'redeem' | 'test_consume' | 'signup_bonus',
  meta?: Record<string, unknown>
): Promise<number | null> {
  const filter = delta < 0 ? { _id: clinicId, credits: { $gte: -delta } } : { _id: clinicId };
  const updated = await Clinic.findOneAndUpdate(filter, { $inc: { credits: delta } }, { new: true });
  if (!updated) return null;
  await CreditTx.create({ clinic: clinicId, delta, reason, meta });
  return updated.credits;
}
