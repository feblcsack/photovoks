import { FrameEditor } from '@/components/frame-builder/FrameEditor';
import { templateById } from '@/lib/frames/presets';
import { normalizeEventCode } from '@/lib/events';

export default async function NewFramePage({ searchParams }: { searchParams: Promise<{ template?: string; event?: string }> }) {
  const { template, event } = await searchParams;
  const design = template ? templateById(template) : { version: 2 as const, width: 600, height: 1800, background: { color: '#ffffff' }, elements: [] };
  return <FrameEditor initialName="Frame baru" initialDesign={design} eventCode={normalizeEventCode(event)} />;
}
