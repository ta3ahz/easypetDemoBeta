import crypto from 'crypto';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { RedeemCode } from '@/models';
import { requireAdminApi, json, jsonError, readJson, auditApp } from '@/lib/adminApi';

export const dynamic = 'force-dynamic';

// GET /api/admin/codes -> {codes, unused}. Latest 100, same as the web page.
export async function GET(req: NextRequest) {
  const admin = await requireAdminApi(req);
  if (admin instanceof NextResponse) return admin;

  const codes = await RedeemCode.find().sort({ createdAt: -1 }).limit(100).populate('usedByDevice', 'name uid').lean();
  return json({
    unused: codes.filter((c) => !c.usedByDevice).length,
    codes: codes.map((c) => {
      const used = c.usedByDevice as unknown as { name?: string; uid?: string } | null;
      return {
        id: String(c._id),
        code: c.code,
        credits: c.credits,
        used: !!used,
        usedBy: used ? used.name || used.uid || '' : null,
        usedAt: c.usedAt ?? null,
        createdAt: c.createdAt,
      };
    }),
  });
}

// POST /api/admin/codes {credits} -> {code}. Same "UBX-" + 8 lowercase hex as the web panel.
export async function POST(req: NextRequest) {
  const admin = await requireAdminApi(req);
  if (admin instanceof NextResponse) return admin;
  const body = await readJson(req);
  const credits = Math.trunc(Number(body?.credits));
  if (!Number.isFinite(credits) || credits < 1) return jsonError(400, 'credits must be at least 1');

  const doc = await RedeemCode.create({ code: 'UBX-' + crypto.randomBytes(4).toString('hex'), credits });
  await auditApp(admin, 'create_code', doc.code, `${credits} credits`);
  return json({ ok: true, code: doc.code, credits });   // as stored (the model upper-cases it, same as web)
}
