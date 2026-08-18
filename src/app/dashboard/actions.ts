'use server';

import { getSession, hashSecret, verifySecret } from '@/lib/auth';
import { dbConnect } from '@/lib/db';
import { Device } from '@/models';
import { logAudit } from '@/lib/audit';

async function requireOwner() {
  const s = await getSession();
  if (!s || s.kind !== 'owner') throw new Error('unauthorized');
  return s;
}

export type SettingsState = { error?: string; ok?: string };

// The web password is the credential for THIS panel. The device PIN and vet list
// are managed on the device itself.
export async function changeWebPassword(_prev: SettingsState, formData: FormData): Promise<SettingsState> {
  const s = await requireOwner();
  const current = String(formData.get('current') || '');
  const next = String(formData.get('next') || '');
  if (next.length < 8) return { error: 'New password must be at least 8 characters.' };
  await dbConnect();
  const device = await Device.findById(s.sub);
  if (!device || !device.webPassHash) return { error: 'No web password set.' };
  if (!(await verifySecret(current, device.webPassHash))) return { error: 'Current password is wrong.' };
  device.webPassHash = await hashSecret(next);
  await device.save();
  await logAudit(s.user, 'change_web_password', device.name || device.uid, 'self-service');
  return { ok: 'Password changed.' };
}
