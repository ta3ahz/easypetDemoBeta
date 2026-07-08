import { requireAdminPage } from '@/lib/guard';
import { dbConnect } from '@/lib/db';
import { Device } from '@/models';
import { PanelShell } from '@/components/PanelShell';
import { ADMIN_NAV } from '@/components/nav';
import { Section, TableWrap, Th, Td, Row, btn, input } from '@/components/ui';
import { fmtDateTime } from '@/lib/format';
import { updateDeviceConfig, setDeviceCredits, deleteDevice } from '../actions';

export const dynamic = 'force-dynamic';

type PopClinic = { _id: string; name?: string; credits?: number };

export default async function AdminDevices() {
  const admin = await requireAdminPage();
  await dbConnect();
  const devices = await Device.find().sort({ lastSeenAt: -1 }).populate('clinic', 'name credits').lean();

  return (
    <PanelShell role="Admin" user={admin.email} nav={ADMIN_NAV} active="/admin/devices">
      <Section
        title="Devices"
        subtitle="Per-device calibration + credits — concentration = log₁₀(i0/raw)·a + b, positive if > ths"
      >
        <TableWrap>
          <thead className="bg-slate-50">
            <tr>
              <Th>UID</Th><Th>Clinic</Th><Th>FW</Th><Th>Last seen</Th><Th>Credits (clinic)</Th><Th>Calibration</Th><Th>Actions</Th>
            </tr>
          </thead>
          <tbody>
            {devices.map((d) => {
              const clinic = d.clinic as unknown as PopClinic | null;
              return (
                <Row key={String(d._id)}>
                  <Td className="font-mono text-slate-800">{d.uid}</Td>
                  <Td>{clinic?.name ?? '—'}</Td>
                  <Td>{d.fw || '—'}</Td>
                  <Td>{fmtDateTime(d.lastSeenAt)}</Td>
                  <Td>
                    {clinic ? (
                      <form action={setDeviceCredits} className="flex gap-1.5 items-center">
                        <input type="hidden" name="clinicId" value={String(clinic._id)} />
                        <input name="credits" type="number" defaultValue={clinic.credits ?? 0} className={`${input} w-20`} />
                        <button className={btn}>Set</button>
                      </form>
                    ) : '—'}
                  </Td>
                  <Td>
                    <form action={updateDeviceConfig} className="flex gap-2 items-center">
                      <input type="hidden" name="deviceId" value={String(d._id)} />
                      <Cfg name="i0" v={d.config?.i0} />
                      <Cfg name="a" v={d.config?.a} />
                      <Cfg name="b" v={d.config?.b} />
                      <Cfg name="ths" v={d.config?.ths} />
                      <button className={btn}>Save</button>
                    </form>
                  </Td>
                  <Td>
                    <form action={deleteDevice}>
                      <input type="hidden" name="deviceId" value={String(d._id)} />
                      <button className="rounded-lg border border-red-200 text-red-600 px-3 py-1.5 text-xs font-semibold hover:bg-red-50 transition-colors">
                        Remove
                      </button>
                    </form>
                  </Td>
                </Row>
              );
            })}
            {devices.length === 0 && <Row><Td>No devices yet.</Td></Row>}
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
      <input name={name} type="number" step="any" defaultValue={v ?? 0} className={`${input} w-20`} />
    </label>
  );
}
