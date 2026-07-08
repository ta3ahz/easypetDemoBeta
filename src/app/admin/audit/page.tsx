import { requireAdminPage } from '@/lib/guard';
import { dbConnect } from '@/lib/db';
import { AuditLog } from '@/models';
import { PanelShell } from '@/components/PanelShell';
import { ADMIN_NAV } from '@/components/nav';
import { Section, TableWrap, Th, Td, Row, Pill } from '@/components/ui';
import { fmtDateTime } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function AdminAudit() {
  const admin = await requireAdminPage();
  await dbConnect();
  const logs = await AuditLog.find().sort({ createdAt: -1 }).limit(200).lean();

  return (
    <PanelShell role="Admin" user={admin.email} nav={ADMIN_NAV} active="/admin/audit">
      <Section title="Audit log" subtitle="Recent administrative actions (traceability)">
        <TableWrap>
          <thead className="bg-slate-50">
            <tr><Th>When</Th><Th>Actor</Th><Th>Action</Th><Th>Target</Th><Th>Detail</Th></tr>
          </thead>
          <tbody>
            {logs.map((l) => (
              <Row key={String(l._id)}>
                <Td>{fmtDateTime(l.createdAt)}</Td>
                <Td className="text-slate-800">{l.actor}</Td>
                <Td><Pill tone="blue">{l.action}</Pill></Td>
                <Td>{l.target}</Td>
                <Td className="text-slate-500">{l.detail}</Td>
              </Row>
            ))}
            {logs.length === 0 && <Row><Td>No activity yet.</Td></Row>}
          </tbody>
        </TableWrap>
      </Section>
    </PanelShell>
  );
}
