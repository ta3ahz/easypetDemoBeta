'use server';

import crypto from 'crypto';
import { revalidatePath } from 'next/cache';
import { getSession } from '@/lib/auth';
import { dbConnect } from '@/lib/db';
import { Clinic, Device, RedeemCode } from '@/models';
import { applyCredits } from '@/lib/device';

async function requireAdmin() {
  const s = await getSession();
  if (!s || s.kind !== 'admin') throw new Error('unauthorized');
}

export async function grantCredits(formData: FormData) {
  await requireAdmin();
  const clinicId = String(formData.get('clinicId') || '');
  const amount = Math.trunc(Number(formData.get('amount') || 0));
  if (!clinicId || !Number.isFinite(amount) || amount === 0) return;
  await dbConnect();
  await applyCredits(clinicId, amount, 'admin_grant');
  revalidatePath('/admin');
}

export async function toggleClinicStatus(formData: FormData) {
  await requireAdmin();
  const clinicId = String(formData.get('clinicId') || '');
  await dbConnect();
  const clinic = await Clinic.findById(clinicId);
  if (!clinic) return;
  clinic.status = clinic.status === 'active' ? 'suspended' : 'active';
  await clinic.save();
  revalidatePath('/admin');
}

export async function updateDeviceConfig(formData: FormData) {
  await requireAdmin();
  const deviceId = String(formData.get('deviceId') || '');
  const i0 = Number(formData.get('i0'));
  const a = Number(formData.get('a'));
  const b = Number(formData.get('b'));
  const ths = Number(formData.get('ths'));
  if (!deviceId || [i0, a, b, ths].some((n) => !Number.isFinite(n))) return;
  await dbConnect();
  await Device.updateOne({ _id: deviceId }, { $set: { config: { i0, a, b, ths } } });
  revalidatePath('/admin');
}

export async function generateCode(formData: FormData) {
  await requireAdmin();
  const credits = Math.trunc(Number(formData.get('credits') || 0));
  if (!Number.isFinite(credits) || credits < 1) return;
  await dbConnect();
  const code = 'EP-' + crypto.randomBytes(4).toString('hex').toUpperCase();
  await RedeemCode.create({ code, credits });
  revalidatePath('/admin');
}
