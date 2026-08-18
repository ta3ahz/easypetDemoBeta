import { requireAdminPage } from '@/lib/guard';
import { dbConnect } from '@/lib/db';
import { Device, Test } from '@/models';
import { recoveryPin } from '@/lib/auth';
import { PanelShell } from '@/components/PanelShell';
import { ADMIN_NAV } from '@/components/nav';
import { Section, TableWrap, Th, Td, Row, btn, input, Pill } from '@/components/ui';
import { fmtDateTime } from '@/lib/format';
import {
  updateDeviceConfig, setDeviceCredits, resetDevicePin, renameDevice, toggleDeviceStatus, deleteDevice,
} from '../actions';

export const dynamic = 'force-dynamic';

export default async function AdminDevices() {
  const admin = await requireAdminPage();
  await dbConnect();
  const devices = await Device.find().sort({ lastSeenAt: -1 }).lean();
  const testCounts = await Test.aggregate([{ $group: { _id: '$device', n: { $sum: 1 } } }]);
  const counts = new Map(testCounts.map((t) => [String(t._id), t.n as number]));

  return (
    <PanelShell role="Admin" user={admin.email} nav={ADMIN_NAV} active="/admin/devices">
      <Section
        title="Devices"
        subtitle="Each device is an account (eFuse MAC). concentration = log₁₀(i0/raw)·a + b, positive if > ths"
      >
        <TableWrap>
          <thead className="bg-slate-50">
            <tr>
              <Th>Name / UID</Th><Th>Status</Th><Th>Tests</Th><Th>Last seen</Th>
              <Th>Credits</Th><Th>Calibration</Th><Th>PIN / Recovery</Th><Th>Actions</Th>
            </tr>
          </thead>
          <tbody>
            {devices.map((d) => {
              const id = String(d._id);
              return (
                <Row key={id}>
                  <Td>
                    <form action={renameDevice} className="flex gap-1.5 items-center">
                      <input type="hidden" name="deviceId" value={id} />
                      <input name="name" defaultValue={d.name} placeholder="(unnamed)" className={`${input} w-36`} />
                      <button className={btn} title="Rename">✓</button>
                    </form>
                    <div className="font-mono text-xs text-slate-400 mt-1">{d.uid}{d.webUser ? ` · web:${d.webUser}` : ''}</div>
                  </Td>
                  <Td>
                    {d.status === 'active' ? <Pill tone="green">active</Pill>
                      : d.status === 'suspended' ? <Pill tone="red">suspended</Pill>
                      : <Pill>new</Pill>}
                  </Td>
                  <Td>{counts.get(id) ?? 0}</Td>
                  <Td className="whitespace-nowrap">{fmtDateTime(d.lastSeenAt)}</Td>
                  <Td>
                    <form action={setDeviceCredits} className="flex gap-1.5 items-center">
                      <input type="hidden" name="deviceId" value={id} />
                      <input name="credits" type="number" defaultValue={d.credits ?? 0} className={`${input} w-20`} />
                      <button className={btn}>Set</button>
                    </form>
                  </Td>
                  <Td>
                    <form action={updateDeviceConfig} className="flex gap-2 items-center flex-wrap">
                      <input type="hidden" name="deviceId" value={id} />
                      <Cfg name="i0" v={d.config?.i0} /><Cfg name="a" v={d.config?.a} />
                      <Cfg name="b" v={d.config?.b} /><Cfg name="ths" v={d.config?.ths} />
                      <button className={btn}>Save</button>
                    </form>
                  </Td>
                  <Td>
                    <form action={resetDevicePin} className="flex gap-1.5 items-center">
                      <input type="hidden" name="deviceId" value={id} />
                      <input name="pin" placeholder="new PIN" inputMode="numeric" maxLength={6} className={`${input} w-24`} />
                      <button className={btn}>Reset</button>
                    </form>
                    <div className="text-xs text-slate-400 mt-1">recovery: <span className="font-mono text-slate-600">{recoveryPin(d.uid)}</span></div>
                  </Td>
                  <Td>
                    <div className="flex gap-1.5">
                      <form action={toggleDeviceStatus}>
                        <input type="hidden" name="deviceId" value={id} />
                        <button className="rounded-lg border border-slate-200 text-slate-600 px-3 py-1.5 text-xs font-semibold hover:bg-slate-50">
                          {d.status === 'suspended' ? 'Activate' : 'Suspend'}
                        </button>
                      </form>
                      <form action={deleteDevice}>
                        <input type="hidden" name="deviceId" value={id} />
                        <button className="rounded-lg border border-red-200 text-red-600 px-3 py-1.5 text-xs font-semibold hover:bg-red-50">
                          Remove
                        </button>
                      </form>
                    </div>
                  </Td>
                </Row>
              );
            })}
            {devices.length === 0 && <Row><Td>No devices yet. They appear here when first powered on online.</Td></Row>}
          </tbody>
        </TableWrap>
      </Section>
    </PanelShell>
  );
}

function Cfg({ name, v }: { name: string; v?: number }) {
  return (
    <label className="flex items-center gap-1 text-xs text-slate-500">
      <span className="font-mono">{name}</span>
      <input name={name} type="number" step="any" defaultValue={v ?? 0} className={`${input} w-16`} />
    </label>
  );
}
