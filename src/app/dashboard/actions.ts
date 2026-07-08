'use server';

import { getSession, hashSecret, verifySecret, pinVerifier } from '@/lib/auth';
import { dbConnect } from '@/lib/db';
import { Clinic } from '@/models';
import { logAudit } from '@/lib/audit';
import { revalidatePath } from 'next/cache';

async function requireClinic() {
  const s = await getSession();
  if (!s || s.kind !== 'clinic') throw new Error('unauthorized');
  return s;
}

export type SettingsState = { error?: string; ok?: string };

export async function updateOwnVets(_prev: SettingsState, formData: FormData): Promise<SettingsState> {
  const s = await requireClinic();
  const vets = String(formData.get('vets') || '')
    .split(',').map((v) => v.trim()).filter(Boolean).slice(0, 3);
  await dbConnect();
  await Clinic.findByIdAndUpdate(s.sub, { vets });
  await logAudit(s.name, 'update_vets', s.name, vets.join(', '));
  revalidatePath('/dashboard/settings');
  return { ok: 'Veterinarians updated.' };
}

export async function changeOwnPin(_prev: SettingsState, formData: FormData): Promise<SettingsState> {
  const s = await requireClinic();
  const current = String(formData.get('current') || '');
  const next = String(formData.get('next') || '').trim();
  if (!/^\d{6}$/.test(next)) return { error: 'New PIN must be 6 digits.' };
  await dbConnect();
  const clinic = await Clinic.findById(s.sub);
  if (!clinic || !(await verifySecret(current, clinic.pinHash))) return { error: 'Current PIN is wrong.' };
  clinic.pinHash = await hashSecret(next);
  const v = pinVerifier(next);
  clinic.pinSalt = v.pinSalt;
  clinic.pinCheck = v.pinCheck;
  await clinic.save();
  await logAudit(s.name, 'change_pin', s.name, 'self-service PIN change');
  return { ok: 'PIN changed.' };
}
