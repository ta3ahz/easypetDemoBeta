'use server';

import { redirect } from 'next/navigation';
import { dbConnect } from '@/lib/db';
import { Clinic, Admin } from '@/models';
import { verifySecret, setSessionCookie, clearSessionCookie } from '@/lib/auth';

export type LoginState = { error?: string };

export async function clinicLogin(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const name = String(formData.get('name') || '').trim();
  const pin = String(formData.get('pin') || '').trim();
  if (!name || !/^\d{6}$/.test(pin)) return { error: 'Enter the clinic name and 6-digit PIN.' };
  await dbConnect();
  const clinic = await Clinic.findOne({ name });
  if (!clinic || !(await verifySecret(pin, clinic.pinHash))) return { error: 'Invalid clinic name or PIN.' };
  if (clinic.status !== 'active') return { error: 'This clinic is suspended.' };
  await setSessionCookie({ kind: 'clinic', sub: String(clinic._id), name: clinic.name });
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
