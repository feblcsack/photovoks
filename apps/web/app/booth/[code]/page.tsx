import { notFound } from 'next/navigation';
import type { Metadata, Viewport } from 'next';
import { getEventRole, loadEventByCode } from '@/lib/access';
import { BoothGate } from '@/components/booth/BoothGate';
import { BoothApp } from '@/components/booth/BoothApp';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Booth', robots: { index: false } };
export const viewport: Viewport = { themeColor: '#0B0F1A', width: 'device-width', initialScale: 1, maximumScale: 1, userScalable: false, viewportFit: 'cover' };

export default async function BoothPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const loaded = await loadEventByCode(code);
  if (!loaded) notFound();
  const role = await getEventRole(loaded);
  if (!role) return <BoothGate code={loaded.event.code} eventName={loaded.event.name} hasPin={loaded.event.hasPin} />;
  return <BoothApp code={loaded.event.code} />;
}
