import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getGuestSession } from '@/lib/sessions';
import { GuestView } from './GuestView';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Foto kamu', robots: { index: false, follow: false } };

export default async function GuestSessionPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const data = await getGuestSession(token);
  if (!data) notFound();
  return <GuestView token={token} initial={data} />;
}
