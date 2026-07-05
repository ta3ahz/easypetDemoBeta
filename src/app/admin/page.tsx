import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { dbConnect } from '@/lib/db';
import { Clinic, Device, Test, RedeemCode } from '@/models';
import { PanelHeader, Stat } from '@/components/PanelHeader';
import { fmtDateTime } from '@/lib/format';
import { grantCredits, toggleClinicStatus, generateCode } from './actions';

export const dynamic = 'force-dynamic';

export default async function AdminPage() {
  const session = await getSession();
  if (!session) redirect('/login');
  if (session.kind !== 'admin') redirect('/dashboard');

  await dbConnect();
  const clinics = await Clinic.find().sort({ createdAt: -1 }).lean();
  const clinicIds = clinics.map((c) => c._id);

  const [devAgg, testAgg, tests, codes, totalTests] = await Promise.all([
    Device.aggregate([{ $match: { clinic: { $in: clinicIds } } }, { $group: { _id: '$clinic', n: { $sum: 1 } } }]),
    Test.aggregate([{ $match: { clinic: { $in: clinicIds } } }, { $group: { _id: '$clinic', n: { $sum: 1 } } }]),
    Test.find().sort({ createdAt: -1 }).limit(50).populate('clinic', 'name').lean(),
    RedeemCode.find().sort({ createdAt: -1 }).limit(20).lean(),
    Test.countDocuments(),
  ]);
  const devMap = new Map(devAgg.map((d) => [String(d._id), d.n]));
  const testMap = new Map(testAgg.map((d) => [String(d._id), d.n]));

  return (
    <div className="min-h-screen bg-slate-50">
      <PanelHeader title="Admin" subtitle={session.email} />
      <main className="max-w-6xl mx-auto px-6 py-6 space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Stat label="Clinics" value={clinics.length} accent="text-blue-600" />
          <Stat label="Total tests" value={totalTests} />
          <Stat label="Unused codes" value={codes.filter((c) => !c.usedBy).length} />
          <Stat label="Devices" value={devAgg.reduce((s, d) => s + d.n, 0)} />
        </div>

        {/* Clinics */}
        <section className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100 font-semibold text-slate-700">Clinics</div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-500 text-left">
                <tr><Th>Clinic</Th><Th>Credits</Th><Th>Tests</Th><Th>Devices</Th><Th>Status</Th><Th>Grant credits</Th></tr>
              </thead>
              <tbody>
                {clinics.map((c) => (
                  <tr key={String(c._id)} className="border-t border-slate-100">
                    <Td className="font-medium text-slate-800">{c.name}</Td>
                    <Td className="font-semibold text-blue-600">{c.credits}</Td>
                    <Td>{testMap.get(String(c._id)) ?? 0}</Td>
                    <Td>{devMap.get(String(c._id)) ?? 0}</Td>
                    <Td>
                      <form action={toggleClinicStatus}>
                        <input type="hidden" name="clinicId" value={String(c._id)} />
                        <button className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${c.status === 'active' ? 'bg-green-50 text-green-600' : 'bg-amber-50 text-amber-600'}`}>
                          {c.status}
                        </button>
                      </form>
                    </Td>
                    <Td>
                      <form action={grantCredits} className="flex gap-1.5 items-center">
                        <input type="hidden" name="clinicId" value={String(c._id)} />
                        <input name="amount" type="number" defaultValue={10} className="w-16 rounded-lg border border-slate-200 px-2 py-1" />
                        <button className="rounded-lg bg-blue-600 text-white px-3 py-1 text-xs font-semibold hover:bg-blue-700">Grant</button>
                      </form>
                    </Td>
                  </tr>
                ))}
                {clinics.length === 0 && <tr><Td>No clinics yet.</Td></tr>}
              </tbody>
            </table>
          </div>
        </section>

        {/* Redeem codes */}
        <section className="grid md:grid-cols-3 gap-6">
          <div className="bg-white rounded-2xl border border-slate-200 p-5">
            <div className="font-semibold text-slate-700 mb-3">Generate redeem code</div>
            <form action={generateCode} className="flex gap-2 items-center">
              <input name="credits" type="number" defaultValue={50} className="w-24 rounded-lg border border-slate-200 px-3 py-2" />
              <span className="text-sm text-slate-500">credits</span>
              <button className="rounded-lg bg-blue-600 text-white px-4 py-2 text-sm font-semibold hover:bg-blue-700">Create</button>
            </form>
          </div>
          <div className="md:col-span-2 bg-white rounded-2xl border border-slate-200 p-5">
            <div className="font-semibold text-slate-700 mb-2">Recent codes</div>
            <div className="grid sm:grid-cols-2 gap-x-6">
              {codes.length === 0 && <div className="text-slate-400 text-sm">None yet.</div>}
              {codes.map((c) => (
                <div key={String(c._id)} className="flex justify-between py-1.5 border-b border-slate-100 text-sm">
                  <span className="font-mono font-semibold text-slate-700">{c.code}</span>
                  <span className="text-slate-500">{c.credits} cr</span>
                  <span className={c.usedBy ? 'text-slate-400' : 'text-green-600 font-medium'}>{c.usedBy ? 'used' : 'unused'}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* All tests */}
        <section className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100 font-semibold text-slate-700">Recent tests (all clinics)</div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-500 text-left">
                <tr><Th>Date</Th><Th>Clinic</Th><Th>Patient</Th><Th>Species</Th><Th>Vet</Th><Th>Result</Th></tr>
              </thead>
              <tbody>
                {tests.map((t) => (
                  <tr key={String(t._id)} className="border-t border-slate-100">
                    <Td>{fmtDateTime(t.finishedAt ?? t.createdAt)}</Td>
                    <Td className="font-medium text-slate-800">{(t.clinic as unknown as { name?: string })?.name ?? '—'}</Td>
                    <Td>{t.patient?.name || '—'}</Td>
                    <Td className="capitalize">{t.patient?.species || '—'}</Td>
                    <Td>{t.vet || '—'}</Td>
                    <Td><ResultBadge positive={t.result?.positive} /></Td>
                  </tr>
                ))}
                {tests.length === 0 && <tr><Td>No tests yet.</Td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-4 py-2 font-semibold">{children}</th>;
}
function Td({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-4 py-2 text-slate-600 ${className}`}>{children}</td>;
}
function ResultBadge({ positive }: { positive?: boolean }) {
  return positive ? (
    <span className="inline-block rounded-full bg-red-50 text-red-600 px-2.5 py-0.5 text-xs font-semibold">POSITIVE</span>
  ) : (
    <span className="inline-block rounded-full bg-green-50 text-green-600 px-2.5 py-0.5 text-xs font-semibold">NEGATIVE</span>
  );
}
