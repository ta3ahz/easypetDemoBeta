import { requireAdminPage } from '@/lib/guard';
import { dbConnect } from '@/lib/db';
import { RedeemCode } from '@/models';
import { PanelShell } from '@/components/PanelShell';
import { ADMIN_NAV } from '@/components/nav';
import { Section, TableWrap, Th, Td, Row, btn, input, Pill } from '@/components/ui';
import { fmtDateTime } from '@/lib/format';
import { generateCode } from '../actions';

export const dynamic = 'force-dynamic';

export default async function AdminCodes() {
  const admin = await requireAdminPage();
  await dbConnect();
  const codes = await RedeemCode.find().sort({ createdAt: -1 }).limit(100).populate('usedBy', 'name').lean();
  const unused = codes.filter((c) => !c.usedBy).length;

  return (
    <PanelShell role="Admin" user={admin.email} nav={ADMIN_NAV} active="/admin/codes">
      <Section title="Generate test-credit code" subtitle="Clinics type the code on the device to add credits">
        <div className="p-5">
          <form action={generateCode} className="flex gap-3 items-end">
            <label className="block">
              <span className="text-xs font-semibold text-slate-500">Credits</span>
              <input name="credits" type="number" defaultValue={50} className={`mt-1 block ${input} w-32`} />
            </label>
            <button className={`${btn} py-2`}>Generate code</button>
          </form>
        </div>
      </Section>

      <Section title="Codes" subtitle={`${unused} unused of ${codes.length}`}>
        <TableWrap>
          <thead className="bg-slate-50">
            <tr><Th>Code</Th><Th>Credits</Th><Th>Status</Th><Th>Used by</Th><Th>Created</Th></tr>
          </thead>
          <tbody>
            {codes.map((c) => (
              <Row key={String(c._id)}>
                <Td className="font-mono font-semibold text-slate-800 text-base">{c.code}</Td>
                <Td>{c.credits}</Td>
                <Td>{c.usedBy ? <Pill>used</Pill> : <Pill tone="green">unused</Pill>}</Td>
                <Td>{(c.usedBy as unknown as { name?: string })?.name ?? '—'}</Td>
                <Td>{fmtDateTime(c.createdAt)}</Td>
              </Row>
            ))}
            {codes.length === 0 && <Row><Td>No codes yet.</Td></Row>}
          </tbody>
        </TableWrap>
      </Section>
    </PanelShell>
  );
}
