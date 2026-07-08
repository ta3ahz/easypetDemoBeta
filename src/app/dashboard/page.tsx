import { redirect } from 'next/navigation';
import { requireClinicPage } from '@/lib/guard';
import { dbConnect } from '@/lib/db';
import { Clinic, Device, Test } from '@/models';
import { PanelShell } from '@/components/PanelShell';
import { CLINIC_NAV } from '@/components/nav';
import { Stat, Section, TableWrap, Th, Td, Row, ResultBadge } from '@/components/ui';
import { fmtDateTime } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function ClinicDashboard() {
  const session = await requireClinicPage();
  await dbConnect();
  const clinic = await Clinic.findById(session.sub).lean();
  if (!clinic) redirect('/login');

  const [tests, testCount, deviceCount] = await Promise.all([
    Test.find({ clinic: clinic._id }).sort({ createdAt: -1 }).limit(100).lean(),
    Test.countDocuments({ clinic: clinic._id }),
    Device.countDocuments({ clinic: clinic._id }),
  ]);

  return (
    <PanelShell role="Clinic" user={clinic.name} nav={CLINIC_NAV} active="/dashboard">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <Stat label="Test credits" value={clinic.credits} accent="text-blue-600" />
        <Stat label="Tests run" value={testCount} />
        <Stat label="Devices" value={deviceCount} />
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
