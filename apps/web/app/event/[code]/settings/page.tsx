import { getEventRole, loadEventByCode } from '@/lib/access';
import { createServerClient } from '@/lib/supabase/server';
import { isAiConfigured } from '@/lib/ai/provider';
import { EventSettings } from '@/components/event/EventSettings';

export default async function EventSettingsPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const loaded = (await loadEventByCode(code))!;
  const role = await getEventRole(loaded);
  const { data: tpl } = loaded.event.activePromptTemplateId
    ? await createServerClient().from('prompt_templates').select('id').eq('id', loaded.event.activePromptTemplateId).maybeSingle()
    : { data: null };
  return <EventSettings initial={loaded.event} isAdmin={role === 'admin'} aiConfigured={isAiConfigured()} hasCustomPrompt={!!tpl} />;
}
