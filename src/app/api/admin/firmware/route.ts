import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { Firmware, Device } from '@/models';
import { requireAdminApi, json, jsonError, readJson, auditApp } from '@/lib/adminApi';

export const dynamic = 'force-dynamic';

// GET /api/admin/firmware -> {releases, activeVersion}
export async function GET(req: NextRequest) {
  const admin = await requireAdminApi(req);
  if (admin instanceof NextResponse) return admin;

  const [releases, fwCounts] = await Promise.all([
    Firmware.find().sort({ createdAt: -1 }).lean(),
    Device.aggregate([{ $group: { _id: '$fw', n: { $sum: 1 } } }]),
  ]);
  const byVersion = new Map(fwCounts.map((r) => [String(r._id || ''), r.n as number]));
  return json({
    activeVersion: releases.find((r) => r.active)?.version ?? null,
    releases: releases.map((r) => ({
      id: String(r._id),
      version: r.version,
      url: r.url,
      sha256: r.sha256 || '',
      notes: r.notes || '',
      active: !!r.active,
      devices: byVersion.get(r.version) ?? 0,
      createdAt: r.createdAt,
    })),
  });
}

// POST /api/admin/firmware {version, url, sha256?, notes?, active?} — same rules as the web form.
export async function POST(req: NextRequest) {
  const admin = await requireAdminApi(req);
  if (admin instanceof NextResponse) return admin;
  const body = await readJson(req);
  if (!body) return jsonError(400, 'invalid body');

  const version = String(body.version ?? '').trim();
  const url = String(body.url ?? '').trim();
  const sha256 = String(body.sha256 ?? '').trim().toLowerCase();
  const notes = String(body.notes ?? '').trim().slice(0, 500);
  const makeActive = body.active === true;
  if (!/^\d+(\.\d+){1,3}$/.test(version)) return jsonError(400, 'Version must look like 2.9.17');
  if (!/^https:\/\//.test(url)) return jsonError(400, 'Binary URL must start with https://');
  if (sha256 && !/^[0-9a-f]{64}$/.test(sha256)) return jsonError(400, 'SHA-256 must be 64 hex characters');

  const fw = await Firmware.findOneAndUpdate(
    { version },
    { version, url, sha256, notes, ...(makeActive ? { active: true } : {}) },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  if (makeActive && fw) await Firmware.updateMany({ _id: { $ne: fw._id } }, { active: false });
  await auditApp(admin, 'add_firmware', version, makeActive ? 'active' : 'draft');
  return json({ ok: true, id: fw ? String(fw._id) : null });
}
