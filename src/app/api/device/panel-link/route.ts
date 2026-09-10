import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { dbConnect } from '@/lib/db';
import { Device } from '@/models';
import { getDeviceToken, signToken } from '@/lib/auth';

// POST /api/device/panel-link   (Authorization: Bearer <device token>)
// Mint a short-lived, single-use token the device shows as a QR code. Scanning it
// (GET /qr?t=...) signs the owner into the web panel — no password in the QR.
export async function POST(req: NextRequest) {
  const tok = getDeviceToken(req);
  if (!tok) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  await dbConnect();
  const device = await Device.findById(tok.sub);
  if (!device) return NextResponse.json({ error: 'device not found' }, { status: 404 });
  if (device.status === 'suspended') return NextResponse.json({ error: 'device suspended' }, { status: 403 });
  if (!device.webUser) return NextResponse.json({ error: 'web login not set up' }, { status: 409 });

  // Store a fresh nonce (single use) with a 5-minute lifetime.
  const nonce = crypto.randomBytes(16).toString('hex');
  device.qrNonce = nonce;
  device.qrNonceExp = new Date(Date.now() + 5 * 60 * 1000);
  await device.save();

  const token = signToken({ kind: 'qrlogin', sub: String(device._id), n: nonce }, '5m');
  return NextResponse.json({ token, expiresIn: 300 });
}
