import { loadEventByCode, getEventRole } from '@/lib/access';
import { createServerClient } from '@/lib/supabase/server';
import { framesForEvent } from '@/lib/frames/server';
import { isAiConfigured } from '@/lib/ai/provider';
import { isPrintStationOnline } from '@/lib/sessions';
import { EventOverview } from '@/components/event/EventOverview';

export default async function EventOverviewPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const loaded = (await loadEventByCode(code))!;
  const role = await getEventRole(loaded);
  const supabase = createServerClient();
  const [frames, online] = await Promise.all([framesForEvent(supabase, loaded.event.id, true), isPrintStationOnline(supabase)]);
  return (
    <EventOverview
      event={loaded.event}
      isAdmin={role === 'admin'}
      frameCount={frames.length}
      aiConfigured={isAiConfigured()}
      printWorkerOnline={online}
    />
  );
}
