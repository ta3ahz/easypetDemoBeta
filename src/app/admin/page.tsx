import { requireAdminPage } from '@/lib/guard';
import { dbConnect } from '@/lib/db';
import { Test, Device } from '@/models';
import { PanelShell } from '@/components/PanelShell';
import { ADMIN_NAV } from '@/components/nav';
import { Stat, Section, TableWrap, Th, Td, Row, ResultBadge, btnGhost } from '@/components/ui';
import { fmtDateTime } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function AdminMeasurements() {
  const admin = await requireAdminPage();
  await dbConnect();
  const [tests, totalTests, deviceCount, activeCount, posCount] = await Promise.all([
    Test.find().sort({ createdAt: -1 }).limit(100).populate('device', 'uid name').lean(),
    Test.countDocuments(),
    Device.countDocuments(),
    Device.countDocuments({ status: 'active' }),
    Test.countDocuments({ 'result.positive': true }),
  ]);

  return (
    <PanelShell role="Admin" user={admin.email} nav={ADMIN_NAV} active="/admin">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Stat label="Measurements" value={totalTests} accent="text-blue-600" />
        <Stat label="Positive" value={posCount} accent="text-red-600" />
        <Stat label="Devices" value={deviceCount} />
        <Stat label="Active" value={activeCount} />
      </div>

      <Section
        title="All measurements"
        subtitle="Full detail — raw reading + computed concentration"
        action={<a href="/api/measurements/export" className={btnGhost}>Export CSV</a>}
      >
        <TableWrap>
          <thead className="bg-slate-50">
            <tr>
              <Th>Date</Th><Th>Device</Th><Th>Patient</Th><Th>Species</Th>
              <Th>Vet</Th><Th>I₀ (blank)</Th><Th>I (sample)</Th><Th>Concentration</Th><Th>Temp</Th><Th>Result</Th>
            </tr>
          </thead>
          <tbody>
            {tests.map((t) => {
              const dev = t.device as unknown as { uid?: string; name?: string } | null;
              return (
                <Row key={String(t._id)}>
                  <Td>{fmtDateTime(t.finishedAt ?? t.createdAt)}</Td>
                  <Td className="text-slate-800">{dev?.name || <span className="font-mono text-xs">{dev?.uid ?? '—'}</span>}</Td>
                  <Td className="text-slate-800">{t.patient?.name || '—'}{t.patient?.owner ? ` · ${t.patient.owner}` : ''}</Td>
                  <Td className="capitalize">{t.patient?.species || '—'}</Td>
                  <Td>{t.vet || '—'}</Td>
                  <Td className="font-mono">{t.i0 ?? '—'}</Td>
                  <Td className="font-mono">{t.raw ?? '—'}</Td>
                  <Td className="font-mono">{t.result?.value != null ? t.result.value.toFixed(3) : '—'}</Td>
                  <Td className="font-mono">{t.temp != null ? `${t.temp.toFixed(1)}°C` : '—'}</Td>
                  <Td><ResultBadge positive={t.result?.positive} /></Td>
                </Row>
              );
            })}
            {tests.length === 0 && <Row><Td>No measurements yet.</Td></Row>}
          </tbody>
        </TableWrap>
      </Section>
    </PanelShell>
  );
}
