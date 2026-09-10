import { NextRequest, NextResponse } from 'next/server';
import { dbConnect } from '@/lib/db';
import { Device } from '@/models';
import { verifyToken, signToken, SESSION_COOKIE, type QrLoginToken } from '@/lib/auth';

// GET /qr?t=<token>
// The target of the device's QR code. Validates the one-time token, clears the
// nonce (single use), sets the owner session cookie, and lands on the dashboard.
//
// NOTE: redirects use a RELATIVE Location on purpose. Behind the Cloudflare/Railway
// proxy `req.url` is the internal origin (https://localhost:8080), so building an
// absolute URL from it sends the phone to a dead host. A relative Location lets the
// browser resolve against the public URL it actually requested (uribx.app).
function redirectTo(path: string): NextResponse {
  return new NextResponse(null, { status: 307, headers: { Location: path } });
}

export async function GET(req: NextRequest) {
  const t = req.nextUrl.searchParams.get('t') || '';
  const payload = verifyToken<QrLoginToken>(t);
  if (!payload || payload.kind !== 'qrlogin') return redirectTo('/login?e=qr');

  await dbConnect();
  const device = await Device.findById(payload.sub);
  if (
    !device ||
    !device.webUser ||
    device.status === 'suspended' ||
    device.qrNonce !== payload.n ||
    !device.qrNonceExp ||
    device.qrNonceExp.getTime() < Date.now()
  ) {
    return redirectTo('/login?e=qr');
  }

  // Single use: burn the nonce so the same QR can't be replayed.
  device.qrNonce = null;
  device.qrNonceExp = null;
  await device.save();

  const session = signToken({ kind: 'owner', sub: String(device._id), user: device.webUser }, '7d');
  const res = redirectTo('/dashboard');
  res.cookies.set(SESSION_COOKIE, session, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
  });
  return res;
}
