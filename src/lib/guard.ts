import { redirect } from 'next/navigation';
import { getSession, type AdminSession, type OwnerSession } from './auth';

export async function requireAdminPage(): Promise<AdminSession> {
  const s = await getSession();
  if (!s) redirect('/login');
  if (s.kind !== 'admin') redirect('/dashboard');
  return s;
}
export async function requireOwnerPage(): Promise<OwnerSession> {
  const s = await getSession();
  if (!s) redirect('/login');
  if (s.kind !== 'owner') redirect('/admin');
  return s;
}
