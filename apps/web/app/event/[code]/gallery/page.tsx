import { loadEventByCode } from '@/lib/access';
import { EventGallery } from '@/components/event/EventGallery';

export default async function GalleryPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const { event } = (await loadEventByCode(code))!;
  return <EventGallery event={event} />;
}
