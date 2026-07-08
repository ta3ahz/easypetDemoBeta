import { requireAdminPage } from '@/lib/guard';
import { dbConnect } from '@/lib/db';
import { Clinic, Device, Test } from '@/models';
import { PanelShell } from '@/components/PanelShell';
import { ADMIN_NAV } from '@/components/nav';
import { Section, TableWrap, Th, Td, Row, btn, btnGhost, input } from '@/components/ui';
import { createClinic, setCredits, resetClinicPin, updateClinicVets, toggleClinicStatus } from '../actions';

export const dynamic = 'force-dynamic';

export default async function AdminClinics() {
  const admin = await requireAdminPage();
  await dbConnect();
  const clinics = await Clinic.find().sort({ createdAt: -1 }).lean();
  const ids = clinics.map((c) => c._id);
  const [devAgg, testAgg] = await Promise.all([
    Device.aggregate([{ $match: { clinic: { $in: ids } } }, { $group: { _id: '$clinic', n: { $sum: 1 } } }]),
    Test.aggregate([{ $match: { clinic: { $in: ids } } }, { $group: { _id: '$clinic', n: { $sum: 1 } } }]),
  ]);
  const devMap = new Map(devAgg.map((d) => [String(d._id), d.n]));
  const testMap = new Map(testAgg.map((d) => [String(d._id), d.n]));

  return (
    <PanelShell role="Admin" user={admin.email} nav={ADMIN_NAV} active="/admin/clinics">
      <Section title="Create clinic" subtitle="A clinic account = username (name) + 6-digit PIN">
        <div className="p-5">
          <form action={createClinic} className="flex flex-wrap gap-3 items-end">
            <Field label="Clinic name" name="name" placeholder="Manisa Vet Lab" />
            <Field label="PIN (6 digits)" name="pin" placeholder="123456" />
            <Field label="Vets (comma-separated)" name="vets" placeholder="Dr. Ozan, Dr. Kaan" wide />
            <Field label="Start credits" name="credits" type="number" defaultValue="0" narrow />
            <button className={`${btn} py-2`}>Create clinic</button>
          </form>
        </div>
      </Section>

      <Section title="Clinics" subtitle={`${clinics.length} total`}>
        <TableWrap>
          <thead className="bg-slate-50">
            <tr>
              <Th>Clinic</Th><Th>Credits</Th><Th>Tests</Th><Th>Devices</Th><Th>Veterinarians</Th><Th>Reset PIN</Th><Th>Status</Th>
            </tr>
          </thead>
          <tbody>
            {clinics.map((c) => (
              <Row key={String(c._id)}>
                <Td className="font-medium text-slate-800">{c.name}</Td>
                <Td>
                  <form action={setCredits} className="flex gap-1.5 items-center">
                    <input type="hidden" name="clinicId" value={String(c._id)} />
                    <input name="credits" type="number" defaultValue={c.credits} className={`${input} w-20`} />
                    <button className={btn}>Set</button>
                  </form>
                </Td>
                <Td>{testMap.get(String(c._id)) ?? 0}</Td>
                <Td>{devMap.get(String(c._id)) ?? 0}</Td>
                <Td>
                  <form action={updateClinicVets} className="flex gap-1.5 items-center">
                    <input type="hidden" name="clinicId" value={String(c._id)} />
                    <input name="vets" defaultValue={c.vets.join(', ')} className={`${input} w-48`} />
                    <button className={btnGhost}>Save</button>
                  </form>
                </Td>
                <Td>
                  <form action={resetClinicPin} className="flex gap-1.5 items-center">
                    <input type="hidden" name="clinicId" value={String(c._id)} />
                    <input name="pin" placeholder="new 6-digit" className={`${input} w-28`} />
                    <button className={btnGhost}>Reset</button>
                  </form>
                </Td>
                <Td>
                  <form action={toggleClinicStatus}>
                    <input type="hidden" name="clinicId" value={String(c._id)} />
                    <button className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${c.status === 'active' ? 'bg-green-50 text-green-600' : 'bg-amber-50 text-amber-600'}`}>
                      {c.status}
                    </button>
                  </form>
                </Td>
              </Row>
            ))}
            {clinics.length === 0 && <Row><Td>No clinics yet.</Td></Row>}
          </tbody>
        </TableWrap>
      </Section>
    </PanelShell>
  );
}

function Field({
  label,
  wide,
  narrow,
  ...props
}: { label: string; wide?: boolean; narrow?: boolean } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block">
      <span className="text-xs font-semibold text-slate-500">{label}</span>
      <input {...props} className={`mt-1 block ${input} ${wide ? 'w-60' : narrow ? 'w-28' : 'w-44'}`} />
    </label>
  );
}
