import { redirect } from 'next/navigation';
import { requireOwnerPage } from '@/lib/guard';
import { dbConnect } from '@/lib/db';
import { Device, Test } from '@/models';
import { PanelShell } from '@/components/PanelShell';
import { OWNER_NAV } from '@/components/nav';
import { Stat, Section, TableWrap, Th, Td, Row, ResultBadge } from '@/components/ui';
import { fmtDateTime } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function OwnerDashboard() {
  const session = await requireOwnerPage();
  await dbConnect();
  const device = await Device.findById(session.sub).lean();
  if (!device) redirect('/login');

  const [tests, testCount, posCount] = await Promise.all([
    Test.find({ device: device._id }).sort({ createdAt: -1 }).limit(100).lean(),
    Test.countDocuments({ device: device._id }),
    Test.countDocuments({ device: device._id, 'result.positive': true }),
  ]);

  return (
    <PanelShell role="Clinic" user={device.name || device.uid} nav={OWNER_NAV} active="/dashboard">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <Stat label="Test credits" value={device.credits} accent="text-blue-600" />
        <Stat label="Tests run" value={testCount} />
        <Stat label="Positive" value={posCount} accent="text-red-600" />
      </div>

      <Section title="Measurement results" subtitle="Positive / negative results from your device">
        <TableWrap>
          <thead className="bg-slate-50">
            <tr><Th>Date</Th><Th>Patient</Th><Th>Owner</Th><Th>Species</Th><Th>Vet</Th><Th>Result</Th></tr>
          </thead>
          <tbody>
            {tests.map((t) => (
              <Row key={String(t._id)}>
                <Td>{fmtDateTime(t.finishedAt ?? t.createdAt)}</Td>
                <Td className="font-medium text-slate-800">{t.patient?.name || '—'}</Td>
                <Td>{t.patient?.owner || '—'}</Td>
                <Td className="capitalize">{t.patient?.species || '—'}</Td>
                <Td>{t.vet || '—'}</Td>
                <Td><ResultBadge positive={t.result?.positive} /></Td>
              </Row>
            ))}
            {tests.length === 0 && <Row><Td>No tests yet.</Td></Row>}
          </tbody>
        </TableWrap>
      </Section>
    </PanelShell>
  );
}
