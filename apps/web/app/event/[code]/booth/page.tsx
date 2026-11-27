import { getEventRole, loadEventByCode } from '@/lib/access';
import { createServerClient } from '@/lib/supabase/server';
import { isAiConfigured } from '@/lib/ai/provider';
import { signMedia } from '@/lib/event-media';
import { getSettings } from '@/lib/settings';
import { qrisProvider } from '@/lib/payments';
import { BoothSettings } from '@/components/event/booth-settings/BoothSettings';

export default async function BoothSettingsPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const loaded = (await loadEventByCode(code))!;
  const role = await getEventRole(loaded);
  const ev = loaded.event;
  const supabase = createServerClient();
  const [tplRes, urls, settings, gateway] = await Promise.all([
    ev.activePromptTemplateId
      ? supabase.from('prompt_templates').select('id').eq('id', ev.activePromptTemplateId).maybeSingle()
      : Promise.resolve({ data: null }),
    signMedia(supabase, [...(ev.attractMediaPath ? [ev.attractMediaPath] : []), ...ev.stickerPaths]),
    getSettings(),
    qrisProvider(),
  ]);
  return (
    <BoothSettings
      initial={ev}
      isAdmin={role === 'admin'}
      aiConfigured={isAiConfigured() && settings.ai.enabled}
      paymentInfo={{ qrisConfigured: !!gateway, globalEnabled: settings.payments.enabled }}
      hasCustomPrompt={!!tplRes.data}
      attractUrl={ev.attractMediaPath ? urls.get(ev.attractMediaPath) ?? null : null}
      stickerUrls={Object.fromEntries(ev.stickerPaths.map((p) => [p, urls.get(p) ?? '']))}
    />
  );
}
