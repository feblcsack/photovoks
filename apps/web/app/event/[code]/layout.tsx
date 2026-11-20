import React from 'react';
import { notFound } from 'next/navigation';
import { getEventRole, loadEventByCode } from '@/lib/access';
import { PortalShell } from '@/components/shell/PortalShell';
import { EventGate } from '@/components/event/EventGate';

export const dynamic = 'force-dynamic';

export default async function EventLayout({ children, params }: { children: React.ReactNode; params: Promise<{ code: string }> }) {
  const { code } = await params;
  const loaded = await loadEventByCode(code);
  if (!loaded) notFound();
  const role = await getEventRole(loaded);
  if (!role) return <EventGate code={loaded.event.code} name={loaded.event.name} hasPin={loaded.event.hasPin} />;
  return (
    <PortalShell mode="event" event={{ code: loaded.event.code, name: loaded.event.name, isAdmin: role === 'admin' }}>
      {children}
    </PortalShell>
  );
}
