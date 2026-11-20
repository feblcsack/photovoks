/** Public / shared gallery queries (SERVER ONLY). Never returns tokens. */
import { createServerClient } from '@/lib/supabase/server';
import { buildSummaries, SESSION_COLUMNS } from '@/lib/sessions';
import type { SessionSummary } from '@/lib/session-types';

const VISIBLE = ['composed', 'printing', 'printed', 'completed'];

export async function sharedEventGallery(galleryToken: string, page = 1, pageSize = 48) {
  if (!/^[a-f0-9]{32}$/.test(galleryToken)) return null;
  const supabase = createServerClient();
  const { data: ev } = await supabase
    .from('events')
    .select('id, name, code, gallery_visibility')
    .eq('gallery_token', galleryToken)
    .maybeSingle();
  if (!ev || ev.gallery_visibility === 'private') return null;
  const { data: rows, count } = await supabase
    .from('sessions')
    .select(SESSION_COLUMNS, { count: 'exact' })
    .eq('event_id', ev.id)
    .eq('is_hidden', false)
    .in('status', VISIBLE)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1);
  const sessions = await buildSummaries(supabase, rows ?? [], { onlyDoneAi: true });
  return { event: { name: ev.name as string }, sessions, total: count ?? 0, pages: Math.max(1, Math.ceil((count ?? 0) / pageSize)) };
}

export interface PublicEventCard { name: string; galleryToken: string; total: number; cover: SessionSummary[] }

export async function publicEvents(): Promise<PublicEventCard[]> {
  const supabase = createServerClient();
  const { data: events } = await supabase
    .from('events')
    .select('id, name, gallery_token')
    .eq('gallery_visibility', 'public')
    .neq('status', 'draft')
    .order('created_at', { ascending: false })
    .limit(30);
  const out: PublicEventCard[] = [];
  for (const ev of events ?? []) {
    const { data: rows, count } = await supabase
      .from('sessions')
      .select(SESSION_COLUMNS, { count: 'exact' })
      .eq('event_id', ev.id)
      .eq('is_hidden', false)
      .in('status', VISIBLE)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(6);
    if (!count) continue;
    out.push({ name: ev.name, galleryToken: ev.gallery_token, total: count, cover: await buildSummaries(supabase, rows ?? [], { onlyDoneAi: true }) });
  }
  return out;
}
