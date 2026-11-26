import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { eventByPublicToken, guestbookEntries, liveItems, liveTheme } from '@/lib/community';
import { LiveWall } from '@/components/live/LiveWall';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Galeri live', robots: { index: false } };

export default async function LivePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const ev = await eventByPublicToken(token);
  if (!ev || !ev.liveEnabled) notFound();
  const [items, messages, theme] = await Promise.all([
    liveItems(ev.id, null, 30),
    ev.guestbookEnabled ? guestbookEntries(ev.id, { limit: 20 }) : Promise.resolve([]),
    liveTheme(ev.id),
  ]);
  return <LiveWall token={token} eventName={ev.name} initialItems={items} initialMessages={messages} guestbook={ev.guestbookEnabled} theme={theme} />;
}
