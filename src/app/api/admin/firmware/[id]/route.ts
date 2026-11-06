import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { Firmware } from '@/models';
import { requireAdminApi, json, jsonError, isId, readJson, auditApp } from '@/lib/adminApi';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

// PATCH /api/admin/firmware/:id {active:true} — make this release the rollout target.
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const admin = await requireAdminApi(req);
  if (admin instanceof NextResponse) return admin;
  const { id } = await params;
  if (!isId(id)) return jsonError(404, 'release not found');
  const body = await readJson(req);
  if (body?.active !== true) return jsonError(400, 'only {active:true} is supported');

  const fw = await Firmware.findByIdAndUpdate(id, { active: true });
  if (!fw) return jsonError(404, 'release not found');
  await Firmware.updateMany({ _id: { $ne: id } }, { active: false });
  await auditApp(admin, 'activate_firmware', fw.version, 'rollout target');
  return json({ ok: true });
}

// DELETE /api/admin/firmware/:id
export async function DELETE(req: NextRequest, { params }: Ctx) {
  const admin = await requireAdminApi(req);
  if (admin instanceof NextResponse) return admin;
  const { id } = await params;
  if (!isId(id)) return jsonError(404, 'release not found');
  const fw = await Firmware.findByIdAndDelete(id);
  if (!fw) return jsonError(404, 'release not found');
  await auditApp(admin, 'delete_firmware', fw.version, 'removed');
  return json({ ok: true });
}
