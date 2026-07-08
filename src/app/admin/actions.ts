'use server';

import crypto from 'crypto';
import { revalidatePath } from 'next/cache';
import { getSession, hashSecret, pinVerifier } from '@/lib/auth';
import { dbConnect } from '@/lib/db';
import { Clinic, Device, RedeemCode } from '@/models';
import { applyCredits } from '@/lib/device';
import { logAudit } from '@/lib/audit';

async function requireAdmin() {
  const s = await getSession();
  if (!s || s.kind !== 'admin') throw new Error('unauthorized');
  return s;
}

/* ------------------------------- clinics --------------------------------- */
export async function createClinic(formData: FormData) {
  const admin = await requireAdmin();
  const name = String(formData.get('name') || '').trim();
  const pin = String(formData.get('pin') || '').trim();
  const credits = Math.max(0, Math.trunc(Number(formData.get('credits') || 0)));
  const vets = String(formData.get('vets') || '')
    .split(',').map((v) => v.trim()).filter(Boolean).slice(0, 3);
  if (name.length < 2 || !/^\d{6}$/.test(pin)) return;
  await dbConnect();
  if (await Clinic.findOne({ name })) return;               // name taken
  const clinic = await Clinic.create({ name, pinHash: await hashSecret(pin), ...pinVerifier(pin), vets, credits: 0 });
  if (credits > 0) await applyCredits(String(clinic._id), credits, 'admin_grant');
  await logAudit(admin.email, 'create_clinic', name, `created with ${credits} credits`);
  revalidatePath('/admin/clinics');
}

export async function setCredits(formData: FormData) {
  const admin = await requireAdmin();
  const clinicId = String(formData.get('clinicId') || '');
  const value = Math.max(0, Math.trunc(Number(formData.get('credits') || 0)));
  if (!clinicId || !Number.isFinite(value)) return;
  await dbConnect();
  const clinic = await Clinic.findById(clinicId);
  if (!clinic) return;
  const delta = value - clinic.credits;
  if (delta !== 0) await applyCredits(clinicId, delta, 'admin_grant');
  await logAudit(admin.email, 'set_credits', clinic.name, `set to ${value} (Δ${delta})`);
  revalidatePath('/admin/clinics');
  revalidatePath('/admin/devices');
}

export async function resetClinicPin(formData: FormData) {
  const admin = await requireAdmin();
  const clinicId = String(formData.get('clinicId') || '');
  const pin = String(formData.get('pin') || '').trim();
  if (!clinicId || !/^\d{6}$/.test(pin)) return;
  await dbConnect();
  const clinic = await Clinic.findById(clinicId);
  if (!clinic) return;
  clinic.pinHash = await hashSecret(pin);
  const v = pinVerifier(pin);
  clinic.pinSalt = v.pinSalt;
  clinic.pinCheck = v.pinCheck;
  await clinic.save();
  await logAudit(admin.email, 'reset_pin', clinic.name, 'PIN reset');
  revalidatePath('/admin/clinics');
}

export async function updateClinicVets(formData: FormData) {
  const admin = await requireAdmin();
  const clinicId = String(formData.get('clinicId') || '');
  const vets = String(formData.get('vets') || '')
    .split(',').map((v) => v.trim()).filter(Boolean).slice(0, 3);
  if (!clinicId) return;
  await dbConnect();
  const clinic = await Clinic.findByIdAndUpdate(clinicId, { vets });
  await logAudit(admin.email, 'update_vets', clinic?.name ?? '', vets.join(', '));
  revalidatePath('/admin/clinics');
}

export async function toggleClinicStatus(formData: FormData) {
  const admin = await requireAdmin();
  const clinicId = String(formData.get('clinicId') || '');
  await dbConnect();
  const clinic = await Clinic.findById(clinicId);
  if (!clinic) return;
  clinic.status = clinic.status === 'active' ? 'suspended' : 'active';
  await clinic.save();
  await logAudit(admin.email, 'toggle_status', clinic.name, clinic.status);
  revalidatePath('/admin/clinics');
}

/* ------------------------------- devices --------------------------------- */
export async function updateDeviceConfig(formData: FormData) {
  const admin = await requireAdmin();
  const deviceId = String(formData.get('deviceId') || '');
  const i0 = Number(formData.get('i0'));
  const a = Number(formData.get('a'));
  const b = Number(formData.get('b'));
  const ths = Number(formData.get('ths'));
  if (!deviceId || [i0, a, b, ths].some((n) => !Number.isFinite(n))) return;
  await dbConnect();
  const device = await Device.findByIdAndUpdate(deviceId, { $set: { config: { i0, a, b, ths } } });
  await logAudit(admin.email, 'set_config', device?.uid ?? '', `i0=${i0} a=${a} b=${b} ths=${ths}`);
  revalidatePath('/admin/devices');
}

export async function deleteDevice(formData: FormData) {
  const admin = await requireAdmin();
  const deviceId = String(formData.get('deviceId') || '');
  if (!deviceId) return;
  await dbConnect();
  const device = await Device.findByIdAndDelete(deviceId);   // measurements are kept for records
  await logAudit(admin.email, 'delete_device', device?.uid ?? deviceId, 'device removed');
  revalidatePath('/admin/devices');
}

// Directly set the owning clinic's credit balance from the Devices tab.
export async function setDeviceCredits(formData: FormData) {
  const admin = await requireAdmin();
  const clinicId = String(formData.get('clinicId') || '');
  const value = Math.max(0, Math.trunc(Number(formData.get('credits') || 0)));
  if (!clinicId) return;
  await dbConnect();
  const clinic = await Clinic.findById(clinicId);
  if (!clinic) return;
  const delta = value - clinic.credits;
  if (delta !== 0) await applyCredits(clinicId, delta, 'admin_grant');
  await logAudit(admin.email, 'set_credits', clinic.name, `set to ${value} (from devices)`);
  revalidatePath('/admin/devices');
}

/* -------------------------------- codes ---------------------------------- */
export async function generateCode(formData: FormData) {
  const admin = await requireAdmin();
  const credits = Math.trunc(Number(formData.get('credits') || 0));
  if (!Number.isFinite(credits) || credits < 1) return;
  await dbConnect();
  const code = 'UBX-' + crypto.randomBytes(4).toString('hex').toUpperCase();
  await RedeemCode.create({ code, credits });
  await logAudit(admin.email, 'create_code', code, `${credits} credits`);
  revalidatePath('/admin/codes');
}
