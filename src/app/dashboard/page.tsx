import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { dbConnect } from '@/lib/db';
import { Clinic, Device, Test } from '@/models';
import { PanelHeader, Stat } from '@/components/PanelHeader';
import { fmtDateTime } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function Dashboard() {
  const session = await getSession();
  if (!session) redirect('/login');
  if (session.kind !== 'clinic') redirect('/admin');

  await dbConnect();
  const clinic = await Clinic.findById(session.sub).lean();
  if (!clinic) redirect('/login');

  const [devices, tests, testCount] = await Promise.all([
    Device.find({ clinic: clinic._id }).sort({ lastSeenAt: -1 }).lean(),
    Test.find({ clinic: clinic._id }).sort({ createdAt: -1 }).limit(50).lean(),
    Test.countDocuments({ clinic: clinic._id }),
  ]);

  return (
    <div className="min-h-screen bg-slate-50">
      <PanelHeader title="Clinic" subtitle={clinic.name} />
      <main className="max-w-6xl mx-auto px-6 py-6 space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Stat label="Test credits" value={clinic.credits} accent="text-blue-600" />
          <Stat label="Tests run" value={testCount} />
          <Stat label="Devices" value={devices.length} />
          <Stat label="Veterinarians" value={clinic.vets.length} />
        </div>

        <section className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100 font-semibold text-slate-700">Recent tests</div>
          {tests.length === 0 ? (
            <div className="p-8 text-center text-slate-400">No tests yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-slate-500 text-left">
                  <tr>
                    <Th>Date</Th><Th>Patient</Th><Th>Owner</Th><Th>Species</Th><Th>Vet</Th><Th>Result</Th>
                  </tr>
                </thead>
                <tbody>
                  {tests.map((t) => (
                    <tr key={String(t._id)} className="border-t border-slate-100">
                      <Td>{fmtDateTime(t.finishedAt ?? t.createdAt)}</Td>
                      <Td className="font-medium text-slate-800">{t.patient?.name || '—'}</Td>
                      <Td>{t.patient?.owner || '—'}</Td>
                      <Td className="capitalize">{t.patient?.species || '—'}</Td>
                      <Td>{t.vet || '—'}</Td>
                      <Td><ResultBadge positive={t.result?.positive} /></Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="grid md:grid-cols-2 gap-6">
          <Card title="Devices">
            {devices.length === 0 ? (
              <Empty>No devices linked.</Empty>
            ) : (
              devices.map((d) => (
                <div key={String(d._id)} className="flex justify-between py-2 border-b border-slate-100 last:border-0 text-sm">
                  <span className="font-mono text-slate-700">{d.uid}</span>
                  <span className="text-slate-400">seen {fmtDateTime(d.lastSeenAt)}</span>
                </div>
              ))
            )}
          </Card>
          <Card title="Veterinarians">
            {clinic.vets.length === 0 ? (
              <Empty>None configured.</Empty>
            ) : (
              clinic.vets.map((v, i) => (
                <div key={i} className="py-2 border-b border-slate-100 last:border-0 text-sm text-slate-700">{v}</div>
              ))
            )}
          </Card>
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
function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5">
      <div className="font-semibold text-slate-700 mb-2">{title}</div>
      {children}
    </div>
  );
}
function Empty({ children }: { children: React.ReactNode }) {
  return <div className="text-slate-400 text-sm py-2">{children}</div>;
}
