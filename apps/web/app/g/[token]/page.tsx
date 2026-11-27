import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { sharedEventGallery } from '@/lib/public-gallery';
import { PublicGallery } from '@/components/gallery/PublicGallery';
import { maintenanceMessage } from '@/lib/maintenance';
import { MaintenanceScreen } from '@/components/os/MaintenanceScreen';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Galeri event', robots: { index: false } };

export default async function SharedGalleryPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ page?: string }> }) {
  const { token } = await params;
  const down = await maintenanceMessage('guest');
  if (down) return <MaintenanceScreen message={down} />;
  const page = Math.max(1, Number((await searchParams).page) || 1);
  const data = await sharedEventGallery(token, page);
  if (!data) notFound();
  return <PublicGallery title={data.event.name} sessions={data.sessions} total={data.total} page={page} pages={data.pages} basePath={`/g/${token}`} />;
}
