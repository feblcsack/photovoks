/**
 * Live gallery + guestbook microsite (SERVER ONLY). Both are addressed by the
 * event's public_token and only work when the owner switched them on.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { createServerClient } from '@/lib/supabase/server';
import { buildSummaries, SESSION_COLUMNS } from '@/lib/sessions';
import { signMedia } from '@/lib/event-media';

export const PUBLIC_TOKEN_RE = /^[a-f0-9]{32}$/;
const VISIBLE = ['composed', 'printing', 'printed', 'completed'];

export interface PublicEvent {
  id: string;
  name: string;
  liveEnabled: boolean;
  guestbookEnabled: boolean;
  galleryVisibility: string;
  galleryToken: string;
}

export async function eventByPublicToken(token: string): Promise<PublicEvent | null> {
  if (!PUBLIC_TOKEN_RE.test(token)) return null;
  const { data } = await createServerClient()
    .from('events')
    .select('id, name, live_enabled, guestbook_enabled, gallery_visibility, gallery_token, status')
    .eq('public_token', token)
    .maybeSingle();
  if (!data) return null;
  return {
    id: data.id,
    name: data.name,
    liveEnabled: !!data.live_enabled,
    guestbookEnabled: !!data.guestbook_enabled,
    galleryVisibility: data.gallery_visibility,
    galleryToken: data.gallery_token,
  };
}

export interface LiveItem {
  id: string;
  at: string;
  strip: string | null;
  thumb: string | null;
  gif: string | null;
  w: number | null;
  h: number | null;
}

export interface GuestbookEntryView {
  id: string;
  name: string;
  message: string;
  photo: string | null;
  createdAt: string;
  hidden?: boolean;
}

/** Newest finished sessions of an event (optionally only those after `after`). */
export async function liveItems(eventId: string, after: string | null, limit = 30): Promise<LiveItem[]> {
  const supabase = createServerClient();
  let q = supabase
    .from('sessions')
    .select(SESSION_COLUMNS + ', completed_at')
    .eq('event_id', eventId)
    .eq('is_hidden', false)
    .in('status', VISIBLE)
    .not('completed_at', 'is', null)
    .gt('expires_at', new Date().toISOString())
    .order('completed_at', { ascending: false })
    .limit(limit);
  if (after) q = q.gt('completed_at', after);
  const { data: rows } = await q;
  const summaries = await buildSummaries(supabase, rows ?? [], { onlyDoneAi: true });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const at = new Map((rows ?? []).map((r: any) => [r.id as string, r.completed_at as string]));
  return summaries.map((s) => ({
    id: s.id,
    at: at.get(s.id) ?? s.createdAt,
    strip: s.urls.strip,
    thumb: s.urls.thumb,
    gif: s.urls.gif,
    w: s.stripWidth,
    h: s.stripHeight,
  }));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function toEntryViews(supabase: SupabaseClient, rows: any[], withHidden = false): Promise<GuestbookEntryView[]> {
  const urls = await signMedia(supabase, rows.map((r) => r.photo_path).filter(Boolean), 6 * 3600);
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    message: r.message,
    photo: r.photo_path ? urls.get(r.photo_path) ?? null : null,
    createdAt: r.created_at,
    ...(withHidden ? { hidden: !!r.is_hidden } : {}),
  }));
}

export async function guestbookEntries(eventId: string, opts: { before?: string | null; after?: string | null; limit?: number; includeHidden?: boolean } = {}): Promise<GuestbookEntryView[]> {
  const supabase = createServerClient();
  let q = supabase
    .from('guestbook_entries')
    .select('id, name, message, photo_path, is_hidden, created_at')
    .eq('event_id', eventId)
    .order('created_at', { ascending: false })
    .limit(Math.min(100, opts.limit ?? 30));
  if (!opts.includeHidden) q = q.eq('is_hidden', false);
  if (opts.before) q = q.lt('created_at', opts.before);
  if (opts.after) q = q.gt('created_at', opts.after);
  const { data } = await q;
  return toEntryViews(supabase, data ?? [], opts.includeHidden);
}

export function isIsoDate(v: string | null): v is string {
  return !!v && v.length < 40 && !Number.isNaN(Date.parse(v));
}
