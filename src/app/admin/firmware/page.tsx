import { requireAdminPage } from '@/lib/guard';
import { dbConnect } from '@/lib/db';
import { Firmware, Device } from '@/models';
import { PanelShell } from '@/components/PanelShell';
import { ADMIN_NAV } from '@/components/nav';
import { Section, TableWrap, Th, Td, Row, btn, input, Pill } from '@/components/ui';
import { fmtDateTime } from '@/lib/format';
import { addFirmware, setActiveFirmware, deleteFirmware } from '../actions';

export const dynamic = 'force-dynamic';

export default async function AdminFirmware() {
  const admin = await requireAdminPage();
  await dbConnect();
  const [releases, fwCounts] = await Promise.all([
    Firmware.find().sort({ createdAt: -1 }).lean(),
    Device.aggregate([{ $group: { _id: '$fw', n: { $sum: 1 } } }]),
  ]);
  const byVersion = new Map(fwCounts.map((r) => [String(r._id || ''), r.n as number]));
  const active = releases.find((r) => r.active);

  return (
    <PanelShell role="Admin" user={admin.email} nav={ADMIN_NAV} active="/admin/firmware">
      <Section
        title="Add firmware release"
        subtitle="Host the .bin on GitHub Releases, then register it here. Devices check via Settings → Check for updates."
      >
        <div className="p-5">
          <form action={addFirmware} className="grid gap-3 max-w-2xl">
            <div className="flex gap-3">
              <label className="block flex-1">
                <span className="text-xs font-semibold text-slate-500">Version (a.b.c)</span>
                <input name="version" placeholder="2.1.0" className={`mt-1 block ${input} w-full`} />
              </label>
              <label className="block flex items-end gap-2 pb-2">
                <input name="active" type="checkbox" defaultChecked className="h-4 w-4" />
                <span className="text-sm text-slate-600">Set as rollout target</span>
              </label>
            </div>
            <label className="block">
              <span className="text-xs font-semibold text-slate-500">Binary URL (HTTPS, .bin)</span>
              <input name="url" placeholder="https://github.com/ta3ahz/easypetDemoBeta/releases/download/v2.1.0/firmware.bin" className={`mt-1 block ${input} w-full font-mono text-xs`} />
            </label>
            <label className="block">
              <span className="text-xs font-semibold text-slate-500">SHA-256 (optional, 64 hex)</span>
              <input name="sha256" placeholder="hex sha256 of the .bin" className={`mt-1 block ${input} w-full font-mono text-xs`} />
            </label>
            <label className="block">
              <span className="text-xs font-semibold text-slate-500">Release notes</span>
              <input name="notes" placeholder="What changed" className={`mt-1 block ${input} w-full`} />
            </label>
            <div><button className={`${btn} py-2`}>Add release</button></div>
          </form>
          <p className="mt-3 text-xs text-slate-400">
            Compute the hash with <code className="font-mono">shasum -a 256 firmware.bin</code>. Only one release is the active target at a time.
          </p>
        </div>
      </Section>

      <Section title="Releases" subtitle={active ? `Rollout target: v${active.version}` : 'No active rollout target'}>
        <TableWrap>
          <thead className="bg-slate-50">
            <tr><Th>Version</Th><Th>Status</Th><Th>Devices on it</Th><Th>URL</Th><Th>Added</Th><Th>Actions</Th></tr>
          </thead>
          <tbody>
            {releases.map((r) => {
              const id = String(r._id);
              return (
                <Row key={id}>
                  <Td className="font-mono font-semibold text-slate-800">v{r.version}</Td>
                  <Td>{r.active ? <Pill tone="green">active</Pill> : <Pill>draft</Pill>}</Td>
                  <Td>{byVersion.get(r.version) ?? 0}</Td>
                  <Td className="max-w-[22rem] truncate"><a href={r.url} className="text-blue-600 hover:underline font-mono text-xs" target="_blank" rel="noreferrer">{r.url}</a></Td>
                  <Td className="whitespace-nowrap">{fmtDateTime(r.createdAt)}</Td>
                  <Td>
                    <div className="flex gap-1.5">
                      {!r.active && (
                        <form action={setActiveFirmware}>
                          <input type="hidden" name="firmwareId" value={id} />
                          <button className="rounded-lg border border-slate-200 text-slate-600 px-3 py-1.5 text-xs font-semibold hover:bg-slate-50">Set active</button>
                        </form>
                      )}
                      <form action={deleteFirmware}>
                        <input type="hidden" name="firmwareId" value={id} />
                        <button className="rounded-lg border border-red-200 text-red-600 px-3 py-1.5 text-xs font-semibold hover:bg-red-50">Remove</button>
                      </form>
                    </div>
                  </Td>
                </Row>
              );
            })}
            {releases.length === 0 && <Row><Td>No firmware releases yet.</Td></Row>}
          </tbody>
        </TableWrap>
      </Section>
    </PanelShell>
  );
}
