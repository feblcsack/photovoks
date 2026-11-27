import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { eventByPublicToken, guestbookEntries } from '@/lib/community';
import { GuestbookMicrosite } from '@/components/guestbook/GuestbookMicrosite';
import { maintenanceMessage } from '@/lib/maintenance';
import { MaintenanceScreen } from '@/components/os/MaintenanceScreen';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Buku tamu', robots: { index: false } };

export default async function GuestbookPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const down = await maintenanceMessage('guest');
  if (down) return <MaintenanceScreen message={down} />;
  const ev = await eventByPublicToken(token);
  if (!ev || !ev.guestbookEnabled) notFound();
  const entries = await guestbookEntries(ev.id, { limit: 30 });
  return (
    <GuestbookMicrosite
      token={token}
      eventName={ev.name}
      initial={entries}
      galleryToken={ev.galleryVisibility !== 'private' ? ev.galleryToken : null}
      liveEnabled={ev.liveEnabled}
    />
  );
}
