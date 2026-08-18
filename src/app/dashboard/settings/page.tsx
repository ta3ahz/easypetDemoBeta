import { redirect } from 'next/navigation';
import { requireOwnerPage } from '@/lib/guard';
import { dbConnect } from '@/lib/db';
import { Device } from '@/models';
import { PanelShell } from '@/components/PanelShell';
import { OWNER_NAV } from '@/components/nav';
import { Section } from '@/components/ui';
import { SettingsClient } from './SettingsClient';

export const dynamic = 'force-dynamic';

export default async function OwnerSettings() {
  const session = await requireOwnerPage();
  await dbConnect();
  const device = await Device.findById(session.sub).lean();
  if (!device) redirect('/login');

  return (
    <PanelShell role="Clinic" user={device.name || device.uid} nav={OWNER_NAV} active="/dashboard/settings">
      <Section title="Settings" subtitle={device.name || device.uid}>
        <div className="p-5">
          <SettingsClient deviceName={device.name} uid={device.uid} hasWeb={!!device.webUser} />
        </div>
      </Section>
    </PanelShell>
  );
}
