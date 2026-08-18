'use server';

import { redirect } from 'next/navigation';
import { dbConnect } from '@/lib/db';
import { Device, Admin } from '@/models';
import { verifySecret, setSessionCookie, clearSessionCookie } from '@/lib/auth';

export type LoginState = { error?: string };

// Device owner logs in with the web username + password they set on the device.
export async function ownerLogin(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const user = String(formData.get('user') || '').trim();
  const password = String(formData.get('password') || '');
  if (!user || !password) return { error: 'Enter your username and password.' };
  await dbConnect();
  const device = await Device.findOne({ webUser: user });
  if (!device || !device.webPassHash || !(await verifySecret(password, device.webPassHash))) {
    return { error: 'Invalid username or password.' };
  }
  if (device.status === 'suspended') return { error: 'This device is suspended.' };
  await setSessionCookie({ kind: 'owner', sub: String(device._id), user });
  redirect('/dashboard');
}

export async function adminLogin(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get('email') || '').trim().toLowerCase();
  const password = String(formData.get('password') || '');
  if (!email || !password) return { error: 'Enter email and password.' };
  await dbConnect();
  const admin = await Admin.findOne({ email });
  if (!admin || !(await verifySecret(password, admin.passwordHash))) return { error: 'Invalid credentials.' };
  await setSessionCookie({ kind: 'admin', sub: String(admin._id), email: admin.email });
  redirect('/admin');
}

export async function logout() {
  await clearSessionCookie();
  redirect('/login');
}
