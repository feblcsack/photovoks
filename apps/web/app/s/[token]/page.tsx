import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getGuestSession } from '@/lib/sessions';
import { GuestView } from './GuestView';
import { maintenanceMessage } from '@/lib/maintenance';
import { MaintenanceScreen } from '@/components/os/MaintenanceScreen';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Foto kamu', robots: { index: false, follow: false } };

export default async function GuestSessionPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const down = await maintenanceMessage('guest');
  if (down) return <MaintenanceScreen message={down} />;
  const data = await getGuestSession(token);
  if (!data) notFound();
  return <GuestView token={token} initial={data} />;
}
