import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { Device } from '@/models';
import { pinVerifier } from '@/lib/auth';
import { applyCredits } from '@/lib/device';
import { requireAdminApi, json, jsonError, isId, readJson, auditApp } from '@/lib/adminApi';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

/*
 * PATCH /api/admin/devices/:id — one change per call, mirroring the web panel's forms:
 *   {name}                      rename
 *   {credits}                   set the balance (ledgered as admin_grant Δ)
 *   {config:{i0,a,b,ths}}       calibration
 *   {pin}                       reset touchscreen PIN (4-6 digits; syncs on next /sync)
 *   {status:'active'|'suspended'}
 * -> {ok:true}
 */
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const admin = await requireAdminApi(req);
  if (admin instanceof NextResponse) return admin;
  const { id } = await params;
  if (!isId(id)) return jsonError(404, 'device not found');
  const body = await readJson(req);
  if (!body) return jsonError(400, 'invalid body');

  const device = await Device.findById(id);
  if (!device) return jsonError(404, 'device not found');
  const label = device.name || device.uid;

  if ('name' in body) {
    const name = String(body.name ?? '').trim().slice(0, 60);
    await Device.updateOne({ _id: id }, { name });
    await auditApp(admin, 'rename_device', device.uid, name);
    return json({ ok: true });
  }

  if ('credits' in body) {
    const value = Math.trunc(Number(body.credits));
    if (!Number.isFinite(value) || value < 0) return jsonError(400, 'credits must be a whole number ≥ 0');
    const delta = value - device.credits;
    if (delta !== 0) await applyCredits(id, delta, 'admin_grant');
    await auditApp(admin, 'set_credits', label, `set to ${value} (Δ${delta})`);
    return json({ ok: true });
  }

  if ('config' in body) {
    const c = (body.config ?? {}) as Record<string, unknown>;
    const [i0, a, b, ths] = [c.i0, c.a, c.b, c.ths].map((v) => (v === '' || v == null ? NaN : Number(v)));
    if ([i0, a, b, ths].some((n) => !Number.isFinite(n))) return jsonError(400, 'i0, a, b and ths must all be numbers');
    await Device.updateOne({ _id: id }, { $set: { config: { i0, a, b, ths } } });
    await auditApp(admin, 'set_config', device.uid, `i0=${i0} a=${a} b=${b} ths=${ths}`);
    return json({ ok: true });
  }

  if ('pin' in body) {
    const pin = String(body.pin ?? '').trim();
    if (!/^\d{4,6}$/.test(pin)) return jsonError(400, 'PIN must be 4-6 digits');
    const v = pinVerifier(pin);
    device.pinSalt = v.pinSalt;
    device.pinCheck = v.pinCheck;
    await device.save();
    await auditApp(admin, 'reset_pin', label, 'PIN reset (syncs to device)');
    return json({ ok: true });
  }

  if ('status' in body) {
    const status = body.status;
    if (status !== 'active' && status !== 'suspended') return jsonError(400, "status must be 'active' or 'suspended'");
    device.status = status;
    await device.save();
    await auditApp(admin, 'toggle_status', label, status);
    return json({ ok: true });
  }

  return jsonError(400, 'nothing to change');
}

// DELETE /api/admin/devices/:id — removes the device; its measurements are kept (same as web).
export async function DELETE(req: NextRequest, { params }: Ctx) {
  const admin = await requireAdminApi(req);
  if (admin instanceof NextResponse) return admin;
  const { id } = await params;
  if (!isId(id)) return jsonError(404, 'device not found');
  const device = await Device.findByIdAndDelete(id);
  if (!device) return jsonError(404, 'device not found');
  await auditApp(admin, 'delete_device', device.uid, 'device removed');
  return json({ ok: true });
}
