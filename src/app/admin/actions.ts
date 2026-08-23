'use server';

import crypto from 'crypto';
import { revalidatePath } from 'next/cache';
import { getSession, pinVerifier } from '@/lib/auth';
import { dbConnect } from '@/lib/db';
import { Device, RedeemCode, Firmware } from '@/models';
import { applyCredits } from '@/lib/device';
import { logAudit } from '@/lib/audit';

async function requireAdmin() {
  const s = await getSession();
  if (!s || s.kind !== 'admin') throw new Error('unauthorized');
  return s;
}

/* ------------------------------- devices --------------------------------- */
export async function setDeviceCredits(formData: FormData) {
  const admin = await requireAdmin();
  const deviceId = String(formData.get('deviceId') || '');
  const value = Math.max(0, Math.trunc(Number(formData.get('credits') || 0)));
  if (!deviceId || !Number.isFinite(value)) return;
  await dbConnect();
  const device = await Device.findById(deviceId);
  if (!device) return;
  const delta = value - device.credits;
  if (delta !== 0) await applyCredits(deviceId, delta, 'admin_grant');
  await logAudit(admin.email, 'set_credits', device.name || device.uid, `set to ${value} (Δ${delta})`);
  revalidatePath('/admin/devices');
}

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

// Admin resets the device's touchscreen PIN. The new verifier syncs to the device
// on its next /sync (online recovery path for a forgotten PIN).
export async function resetDevicePin(formData: FormData) {
  const admin = await requireAdmin();
  const deviceId = String(formData.get('deviceId') || '');
  const pin = String(formData.get('pin') || '').trim();
  if (!deviceId || !/^\d{4,6}$/.test(pin)) return;
  await dbConnect();
  const device = await Device.findById(deviceId);
  if (!device) return;
  const v = pinVerifier(pin);
  device.pinSalt = v.pinSalt;
  device.pinCheck = v.pinCheck;
  await device.save();
  await logAudit(admin.email, 'reset_pin', device.name || device.uid, 'PIN reset (syncs to device)');
  revalidatePath('/admin/devices');
}

export async function renameDevice(formData: FormData) {
  const admin = await requireAdmin();
  const deviceId = String(formData.get('deviceId') || '');
  const name = String(formData.get('name') || '').trim().slice(0, 60);
  if (!deviceId) return;
  await dbConnect();
  const device = await Device.findByIdAndUpdate(deviceId, { name });
  await logAudit(admin.email, 'rename_device', device?.uid ?? '', name);
  revalidatePath('/admin/devices');
}

export async function toggleDeviceStatus(formData: FormData) {
  const admin = await requireAdmin();
  const deviceId = String(formData.get('deviceId') || '');
  await dbConnect();
  const device = await Device.findById(deviceId);
  if (!device) return;
  device.status = device.status === 'suspended' ? 'active' : 'suspended';
  await device.save();
  await logAudit(admin.email, 'toggle_status', device.name || device.uid, device.status);
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

/* ------------------------------ firmware (OTA) --------------------------- */
export async function addFirmware(formData: FormData) {
  const admin = await requireAdmin();
  const version = String(formData.get('version') || '').trim();
  const url = String(formData.get('url') || '').trim();
  const sha256 = String(formData.get('sha256') || '').trim().toLowerCase();
  const notes = String(formData.get('notes') || '').trim().slice(0, 500);
  const makeActive = formData.get('active') === 'on';
  if (!/^\d+(\.\d+){1,3}$/.test(version)) return;                 // a.b.c
  if (!/^https:\/\//.test(url)) return;                          // HTTPS only
  if (sha256 && !/^[0-9a-f]{64}$/.test(sha256)) return;          // 32-byte hex if given
  await dbConnect();
  const fw = await Firmware.findOneAndUpdate(
    { version },
    { version, url, sha256, notes, ...(makeActive ? { active: true } : {}) },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  if (makeActive && fw) await Firmware.updateMany({ _id: { $ne: fw._id } }, { active: false });
  await logAudit(admin.email, 'add_firmware', version, makeActive ? 'active' : 'draft');
  revalidatePath('/admin/firmware');
}

export async function setActiveFirmware(formData: FormData) {
  const admin = await requireAdmin();
  const id = String(formData.get('firmwareId') || '');
  if (!id) return;
  await dbConnect();
  const fw = await Firmware.findByIdAndUpdate(id, { active: true });
  if (fw) await Firmware.updateMany({ _id: { $ne: id } }, { active: false });
  await logAudit(admin.email, 'activate_firmware', fw?.version ?? id, 'rollout target');
  revalidatePath('/admin/firmware');
}

export async function deleteFirmware(formData: FormData) {
  const admin = await requireAdmin();
  const id = String(formData.get('firmwareId') || '');
  if (!id) return;
  await dbConnect();
  const fw = await Firmware.findByIdAndDelete(id);
  await logAudit(admin.email, 'delete_firmware', fw?.version ?? id, 'removed');
  revalidatePath('/admin/firmware');
}

/* -------------------------------- codes ---------------------------------- */
export async function generateCode(formData: FormData) {
  const admin = await requireAdmin();
  const credits = Math.trunc(Number(formData.get('credits') || 0));
  if (!Number.isFinite(credits) || credits < 1) return;
  await dbConnect();
  // Body is lowercase hex (0-9a-f) so the operator types only lowercase + digits
  // after the fixed "UBX-" prefix (which the device adds automatically).
  const code = 'UBX-' + crypto.randomBytes(4).toString('hex');
  await RedeemCode.create({ code, credits });
  await logAudit(admin.email, 'create_code', code, `${credits} credits`);
  revalidatePath('/admin/codes');
}
