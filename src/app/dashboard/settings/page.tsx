import { redirect } from 'next/navigation';
import { requireClinicPage } from '@/lib/guard';
import { dbConnect } from '@/lib/db';
import { Clinic } from '@/models';
import { PanelShell } from '@/components/PanelShell';
import { CLINIC_NAV } from '@/components/nav';
import { Section } from '@/components/ui';
import { SettingsClient } from './SettingsClient';

export const dynamic = 'force-dynamic';

export default async function ClinicSettings() {
  const session = await requireClinicPage();
  await dbConnect();
  const clinic = await Clinic.findById(session.sub).lean();
  if (!clinic) redirect('/login');

  return (
    <PanelShell role="Clinic" user={clinic.name} nav={CLINIC_NAV} active="/dashboard/settings">
      <Section title="Clinic settings" subtitle={clinic.name}>
        <div className="p-5">
          <SettingsClient vets={clinic.vets.join(', ')} />
        </div>
      </Section>
    </PanelShell>
  );
}
