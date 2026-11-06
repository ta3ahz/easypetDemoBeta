import type { NextRequest } from 'next/server';
import { dbConnect } from '@/lib/db';
import { Admin } from '@/models';
import { verifySecret } from '@/lib/auth';
import {
  issueAdminAppToken, json, jsonError, readJson, loginBlocked, noteLoginFailure, clearLoginFailures, clientIp,
  APP_TOKEN_TTL,
} from '@/lib/adminApi';

export const dynamic = 'force-dynamic';

// POST /api/admin/login {email, password} -> {token, email, expiresIn}
// Same credentials and checks as the web panel's admin login.
export async function POST(req: NextRequest) {
  const body = await readJson(req);
  const email = String(body?.email ?? '').trim().toLowerCase();
  const password = String(body?.password ?? '');
  if (!email || !password) return jsonError(400, 'Enter email and password.');

  const key = `${clientIp(req)}|${email}`;
  if (loginBlocked(key)) return jsonError(429, 'Too many attempts. Try again in 15 minutes.');

  await dbConnect();
  const admin = await Admin.findOne({ email });
  if (!admin || !(await verifySecret(password, admin.passwordHash))) {
    noteLoginFailure(key);
    return jsonError(401, 'Invalid credentials.');
  }
  clearLoginFailures(key);
  return json({ token: issueAdminAppToken(String(admin._id), admin.email), email: admin.email, expiresIn: APP_TOKEN_TTL });
}
