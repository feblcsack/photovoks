import { getEventRole, loadEventByCode } from '@/lib/access';
import { EventFrames } from '@/components/event/EventFrames';

export default async function EventFramesPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const loaded = (await loadEventByCode(code))!;
  const role = await getEventRole(loaded);
  return <EventFrames code={loaded.event.code} eventName={loaded.event.name} isAdmin={role === 'admin'} />;
}
