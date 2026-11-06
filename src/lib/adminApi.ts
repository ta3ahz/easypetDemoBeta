import { NextResponse, type NextRequest } from 'next/server';
import mongoose from 'mongoose';
import { signToken, verifyToken, type AdminSession } from './auth';
import { dbConnect } from './db';
import { Admin } from '@/models';
import { logAudit } from './audit';

/* ----------------------------------------------------------------------------
 * JSON API for the mobile admin app (/api/admin/*).
 *
 * Additive only: the web panel keeps its cookie session + server actions
 * untouched. The app authenticates with a bearer JWT of the same `admin` kind
 * the web session uses, so it carries exactly the same privileges. Every
 * request re-checks that the admin still exists, so deleting an admin
 * revokes their app tokens immediately.
 * ------------------------------------------------------------------------- */

export const APP_TOKEN_TTL = '30d';
export type AdminCtx = { id: string; email: string };

export function issueAdminAppToken(id: string, email: string): string {
  const s: AdminSession = { kind: 'admin', sub: id, email };
  return signToken(s, APP_TOKEN_TTL);
}

export function jsonError(status: number, error: string) {
  return NextResponse.json({ error }, { status, headers: { 'Cache-Control': 'no-store' } });
}

export function json<T>(body: T, status = 200) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

/** Resolve the calling admin from `Authorization: Bearer <jwt>`, or a 401 response. */
export async function requireAdminApi(req: NextRequest): Promise<AdminCtx | NextResponse> {
  const m = (req.headers.get('authorization') || '').match(/^Bearer\s+(.+)$/i);
  if (!m) return jsonError(401, 'unauthorized');
  const t = verifyToken<AdminSession>(m[1]);
  if (!t || t.kind !== 'admin' || !mongoose.isValidObjectId(t.sub)) return jsonError(401, 'unauthorized');
  await dbConnect();
  const admin = await Admin.findById(t.sub).select('email').lean();
  if (!admin || admin.email !== t.email) return jsonError(401, 'unauthorized');
  return { id: String(admin._id), email: admin.email };
}

/** Audit entries from the app are tagged so they can be told apart from web-panel actions. */
export function auditApp(admin: AdminCtx, action: string, target: string, detail: string) {
  return logAudit(admin.email, action, target, `${detail} [app]`);
}

export function isId(id: string): boolean {
  return mongoose.isValidObjectId(id);
}

/** Parse a JSON body; returns null on malformed input instead of throwing. */
export async function readJson(req: NextRequest): Promise<Record<string, unknown> | null> {
  try {
    const b = await req.json();
    return b && typeof b === 'object' && !Array.isArray(b) ? (b as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/* ------------------------- login brute-force guard ----------------------- */
// In-memory, per process: max 8 failed logins per IP+email in 15 min.
const FAIL_WINDOW_MS = 15 * 60 * 1000;
const FAIL_MAX = 8;
const failures = new Map<string, number[]>();

function recent(key: string): number[] {
  const now = Date.now();
  const list = (failures.get(key) || []).filter((t) => now - t < FAIL_WINDOW_MS);
  if (list.length) failures.set(key, list);
  else failures.delete(key);
  return list;
}
export function loginBlocked(key: string): boolean {
  return recent(key).length >= FAIL_MAX;
}
export function noteLoginFailure(key: string) {
  const list = recent(key);
  list.push(Date.now());
  failures.set(key, list);
  if (failures.size > 5000) failures.clear();   // bound memory under abuse
}
export function clearLoginFailures(key: string) {
  failures.delete(key);
}
export function clientIp(req: NextRequest): string {
  return (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'unknown';
}
