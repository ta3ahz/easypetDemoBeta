import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { cookies } from 'next/headers';
import type { NextRequest } from 'next/server';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-insecure-secret-change-me';
export const SESSION_COOKIE = 'ep_session';

/* ------------------------------ hashing ---------------------------------- */
export async function hashSecret(secret: string): Promise<string> {
  return bcrypt.hash(secret, 10);
}
export async function verifySecret(secret: string, hash: string): Promise<boolean> {
  return bcrypt.compare(secret, hash);
}

// Device-side PIN verifier: the offline device can't run bcrypt, so alongside the
// bcrypt pinHash we also store a salted SHA-256 the firmware can recompute with
// mbedtls. Regenerate this whenever the PIN changes so device syncs stay current.
export function pinVerifier(pin: string): { pinSalt: string; pinCheck: string } {
  const pinSalt = crypto.randomBytes(8).toString('hex');
  const pinCheck = crypto.createHash('sha256').update(pinSalt + pin).digest('hex');
  return { pinSalt, pinCheck };
}

/* -------------------------------- JWT ------------------------------------ */
export type DeviceToken = { kind: 'device'; sub: string; uid: string; clinic: string };
export type ClinicSession = { kind: 'clinic'; sub: string; name: string };
export type AdminSession = { kind: 'admin'; sub: string; email: string };
export type Session = ClinicSession | AdminSession;
export type AnyToken = DeviceToken | Session;

export function signToken(payload: AnyToken, expiresIn: string | number = '30d'): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: expiresIn as jwt.SignOptions['expiresIn'] });
}
export function verifyToken<T extends AnyToken = AnyToken>(token: string): T | null {
  try {
    return jwt.verify(token, JWT_SECRET) as T;
  } catch {
    return null;
  }
}

/* --------------------------- device (bearer) ----------------------------- */
export function getDeviceToken(req: NextRequest): DeviceToken | null {
  const auth = req.headers.get('authorization') || '';
  const m = auth.match(/^Bearer\s+(.+)$/i);
  if (!m) return null;
  const t = verifyToken(m[1]);
  return t && t.kind === 'device' ? t : null;
}

/* --------------------------- panel (cookie) ------------------------------ */
export async function setSessionCookie(session: Session) {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, signToken(session, '7d'), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
  });
}
export async function clearSessionCookie() {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
}
export async function getSession(): Promise<Session | null> {
  const jar = await cookies();
  const raw = jar.get(SESSION_COOKIE)?.value;
  if (!raw) return null;
  const t = verifyToken<Session>(raw);
  return t && (t.kind === 'clinic' || t.kind === 'admin') ? t : null;
}
