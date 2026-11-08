// Parse the measurement-unit health summary that firmware >= 2.9.18 appends to
// GET /api/device/sync:  ?uok=29&um=0&uoff=0&ut=27.4&ue=23:4,22:1
// Returns null when the request carries no summary (older firmware) so the
// caller can skip the update entirely — old devices are handled exactly as before.
import type { IUnitHealth, IUnitEvent } from '@/models';

const clampInt = (v: string | null, max = 65535) => {
  const n = parseInt(v ?? '', 10);
  return Number.isFinite(n) && n >= 0 ? Math.min(n, max) : 0;
};

export function parseUnitHealth(sp: URLSearchParams, now = new Date()): IUnitHealth | null {
  if (!sp.has('uok')) return null;
  const t = parseFloat(sp.get('ut') ?? '');
  const errs: { code: string; n: number }[] = [];
  for (const part of (sp.get('ue') ?? '').split(',').slice(0, 8)) {
    const m = /^([0-9A-Fa-f]{2}):(\d{1,5})$/.exec(part.trim());
    if (m) errs.push({ code: m[1].toUpperCase(), n: clampInt(m[2]) });
  }
  return {
    at: now,
    temp: Number.isFinite(t) && t > -100 && t < 200 ? Math.round(t * 10) / 10 : null,
    ok: clampInt(sp.get('uok')),
    missed: clampInt(sp.get('um')),
    off: sp.get('uoff') === '1',
    errs,
  };
}

/** Problem events worth keeping in the device's short history. */
export function unitEventsOf(h: IUnitHealth): IUnitEvent[] {
  const ev: IUnitEvent[] = h.errs.filter((e) => e.n > 0).map((e) => ({ at: h.at, code: e.code, n: e.n }));
  if (h.missed > 0 && h.ok === 0 && h.errs.length === 0) ev.push({ at: h.at, code: 'NOREPLY', n: h.missed });
  return ev;
}

// ONEXIS error codes (main.h ErrorCode_t) -> short label for the panel.
const LABELS: Record<string, string> = {
  '20': 'sensor not found',
  '21': 'sensor init failed',
  '22': 'sensor read failed',
  '23': 'sensor value out of range',
  '24': 'sensor saturated',
  '25': 'sensor temp read failed',
  '26': 'sensor config failed',
  '52': 'invalid command',
  NOREPLY: 'no reply (cable / power)',
};
export const unitErrLabel = (code: string) => LABELS[code.toUpperCase()] ?? 'error';
