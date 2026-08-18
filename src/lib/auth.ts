import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { cookies } from 'next/headers';
import type { NextRequest } from 'next/server';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-insecure-secret-change-me';
// Shared secret used to derive each device's offline recovery PIN from its UID.
// MUST match the constant embedded in the firmware. Change only in lockstep.
const RECOVERY_SALT = process.env.RECOVERY_SALT || 'uribx-recovery-2026';
export const SESSION_COOKIE = 'ubx_session';

/* ------------------------------ hashing ---------------------------------- */
export async function hashSecret(secret: string): Promise<string> {
  return bcrypt.hash(secret, 10);
}
export async function verifySecret(secret: string, hash: string): Promise<boolean> {
  return bcrypt.compare(secret, hash);
}

// Device-side PIN verifier: the offline device can't run bcrypt, so we store a
// salted SHA-256 the firmware recomputes with mbedtls. Regenerate on every PIN
// change so device syncs stay current.
export function pinVerifier(pin: string): { pinSalt: string; pinCheck: string } {
  const pinSalt = crypto.randomBytes(8).toString('hex');
  const pinCheck = crypto.createHash('sha256').update(pinSalt + pin).digest('hex');
  return { pinSalt, pinCheck };
}

// Per-device offline recovery PIN = HMAC(RECOVERY_SALT, uid) -> 8 digits.
// Different for every device, so a single leak never unlocks the whole fleet.
// The firmware computes the same value with the embedded salt.
export function recoveryPin(uid: string): string {
  const h = crypto.createHmac('sha256', RECOVERY_SALT).update(uid.toUpperCase()).digest('hex');
  const n = parseInt(h.slice(0, 12), 16) % 100000000;
  return String(n).padStart(8, '0');
}

/* -------------------------------- JWT ------------------------------------ */
export type DeviceToken = { kind: 'device'; sub: string; uid: string };
export type OwnerSession = { kind: 'owner'; sub: string; user: string };
export type AdminSession = { kind: 'admin'; sub: string; email: string };
export type Session = OwnerSession | AdminSession;
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
  return t && (t.kind === 'owner' || t.kind === 'admin') ? t : null;
}
