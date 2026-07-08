import { redirect } from 'next/navigation';
import { getSession, type AdminSession, type ClinicSession } from './auth';

export async function requireAdminPage(): Promise<AdminSession> {
  const s = await getSession();
  if (!s) redirect('/login');
  if (s.kind !== 'admin') redirect('/dashboard');
  return s;
}
export async function requireClinicPage(): Promise<ClinicSession> {
  const s = await getSession();
  if (!s) redirect('/login');
  if (s.kind !== 'clinic') redirect('/admin');
  return s;
}
