import { loadEventByCode } from '@/lib/access';
import { GuestbookModeration } from '@/components/event/GuestbookModeration';

export default async function GuestbookAdminPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const { event } = (await loadEventByCode(code))!;
  return <GuestbookModeration code={event.code} enabled={event.guestbookEnabled} liveEnabled={event.liveEnabled} publicToken={event.publicToken} />;
}
