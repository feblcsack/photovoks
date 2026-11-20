import { notFound } from 'next/navigation';
import { createServerClient } from '@/lib/supabase/server';
import { FRAME_COLUMNS, hydrateFrames } from '@/lib/frames/server';
import { isUuid } from '@/lib/security';
import { normalizeEventCode } from '@/lib/events';
import { FrameEditor } from '@/components/frame-builder/FrameEditor';

export const dynamic = 'force-dynamic';

export default async function EditFramePage({ params, searchParams }: { params: Promise<{ frameId: string }>; searchParams: Promise<{ event?: string }> }) {
  const { frameId } = await params;
  const { event } = await searchParams;
  if (!isUuid(frameId)) notFound();
  const supabase = createServerClient();
  const { data: row } = await supabase.from('frames').select(FRAME_COLUMNS).eq('id', frameId).maybeSingle();
  if (!row) notFound();
  const [frame] = await hydrateFrames(supabase, [row]);
  return <FrameEditor key={frame.id} frameId={frame.id} initialName={frame.name} initialDesign={frame.design} initialActive={frame.isActive} eventCode={normalizeEventCode(event)} />;
}
