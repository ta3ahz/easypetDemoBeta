import { NextRequest, NextResponse } from 'next/server';
import { dbConnect } from '@/lib/db';
import { Device } from '@/models';
import { verifyToken, signToken, SESSION_COOKIE, type QrLoginToken } from '@/lib/auth';

// GET /qr?t=<token>
// The target of the device's QR code. Validates the one-time token, clears the
// nonce (single use), sets the owner session cookie, and lands on the dashboard.
export async function GET(req: NextRequest) {
  const fail = () => {
    const url = new URL('/login', req.url);
    url.searchParams.set('e', 'qr');   // "QR link expired or invalid"
    return NextResponse.redirect(url);
  };

  const t = req.nextUrl.searchParams.get('t') || '';
  const payload = verifyToken<QrLoginToken>(t);
  if (!payload || payload.kind !== 'qrlogin') return fail();

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
    return fail();
  }

  // Single use: burn the nonce so the same QR can't be replayed.
  device.qrNonce = null;
  device.qrNonceExp = null;
  await device.save();

  const session = signToken({ kind: 'owner', sub: String(device._id), user: device.webUser }, '7d');
  const res = NextResponse.redirect(new URL('/dashboard', req.url));
  res.cookies.set(SESSION_COOKIE, session, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
  });
  return res;
}
