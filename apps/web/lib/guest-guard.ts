/**
 * Resolves a session from its public token for guest routes (SERVER ONLY).
 * Also reports whether the caller is an event manager on this device (booth
 * operator / admin), which lifts guest limits.
 */
import { createServerClient } from '@/lib/supabase/server';
import { isSessionToken } from '@/lib/security';
import { getEventRole, loadEventByCode, type AccessRole } from '@/lib/access';
import type { EventConfig } from '@/lib/events';

export interface GuestContext {
  session: { id: string; token: string; event_id: string; shot_count: number; status: string; expires_at: string };
  event: EventConfig;
  role: AccessRole | null;
}

export async function resolveGuest(token: string): Promise<GuestContext | null> {
  if (!isSessionToken(token)) return null;
  const supabase = createServerClient();
  const { data: session } = await supabase
    .from('sessions')
    .select('id, token, event_id, shot_count, status, expires_at')
    .eq('token', token)
    .maybeSingle();
  if (!session) return null;
  if (new Date(session.expires_at).getTime() < Date.now()) return null;
  const { data: ev } = await supabase.from('events').select('code').eq('id', session.event_id).maybeSingle();
  if (!ev) return null;
  const loaded = await loadEventByCode(ev.code);
  if (!loaded) return null;
  return { session, event: loaded.event, role: await getEventRole(loaded) };
}
