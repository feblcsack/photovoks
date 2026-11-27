/**
 * Session data access (SERVER ONLY): summaries with stable /media URLs.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { createServerClient } from '@/lib/supabase/server';
import { isSessionToken } from '@/lib/security';
import { mediaUrls } from '@/lib/event-media';
import { mediaUrl, removeFolder } from '@/lib/storage';
import { isAiConfigured } from '@/lib/ai/provider';
import { EVENT_COLUMNS, mapEvent } from '@/lib/events';
import { getSettings } from '@/lib/settings';
import { paymentRequirement } from '@/lib/payments';
import { stickerLibrary } from '@/lib/sticker-library';
import type { AiGenerationView, GuestSessionData, PrintJobView, SessionSummary } from '@/lib/session-types';
import { sanitizeWallStickers, type WallSticker } from '@/lib/y2k-stickers';

export const HEARTBEAT_ONLINE_THRESHOLD_MS = 90_000;

export const SESSION_COLUMNS =
  'id, token, event_id, frame_id, status, created_at, expires_at, shot_count, live_frames, has_live, has_gif, has_thumb, ' +
  'is_hidden, print_count, strip_width, strip_height, filter, frames(name)';

export function sessionPath(sessionId: string, file: string) {
  return `sessions/${sessionId}/${file}`;
}

/**
 * Builds SessionSummary objects for DB rows.
 * `withToken` must only be true for authorised managers.
 */
export async function buildSummaries(
  supabase: SupabaseClient,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rows: any[],
  opts: { withToken?: boolean; withPrintJobs?: boolean; onlyDoneAi?: boolean } = {},
): Promise<SessionSummary[]> {
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id as string);

  // One round-trip: AI results, print jobs and legacy sketches in parallel.
  const [aiRes, printRes, { data: legacySketches }] = await Promise.all([
    supabase
      .from('ai_generations')
      .select('id, session_id, style_id, shot_index, status, result_path, error_reason, created_at')
      .in('session_id', ids)
      .order('created_at', { ascending: true }),
    opts.withPrintJobs
      ? supabase
          .from('print_jobs')
          .select('id, session_id, type, status, copies, source, error_reason, created_at')
          .in('session_id', ids)
          .order('created_at', { ascending: false })
      : Promise.resolve({ data: [] as never[] }),
    // Legacy single "sketch" results (pre-v2) are shown as an AI result too.
    supabase.from('sketch_jobs').select('id, session_id, status, card_path, error_reason, created_at').in('session_id', ids),
  ]);

  const aiRows = (aiRes.data ?? []).filter((a) => !opts.onlyDoneAi || a.status === 'done');
  // Stable /media URLs (no storage round-trip, cacheable by browsers + CDN).
  const sessionUrl = (id: string, file: string) => mediaUrl('sessions', sessionPath(id, file));
  const sketchUrl = (path: string | null) => (path ? mediaUrl('sketches', path) : null);

  const aiBySession = new Map<string, AiGenerationView[]>();
  for (const s of legacySketches ?? []) {
    if (opts.onlyDoneAi && s.status !== 'done') continue;
    const list = aiBySession.get(s.session_id) ?? [];
    list.push({
      id: s.id,
      styleId: 'doodle',
      shotIndex: 0,
      status: s.status,
      url: s.status === 'done' ? sketchUrl(s.card_path) : null,
      error: s.error_reason,
      createdAt: s.created_at,
    });
    aiBySession.set(s.session_id, list);
  }
  for (const a of aiRows) {
    const list = aiBySession.get(a.session_id) ?? [];
    list.push({
      id: a.id,
      styleId: a.style_id,
      shotIndex: a.shot_index,
      status: a.status,
      url: a.status === 'done' ? sketchUrl(a.result_path) : null,
      error: a.error_reason,
      createdAt: a.created_at,
    });
    aiBySession.set(a.session_id, list);
  }

  const printsBySession = new Map<string, PrintJobView[]>();
  for (const p of (printRes.data ?? []) as Array<Record<string, unknown>>) {
    const list = printsBySession.get(p.session_id as string) ?? [];
    list.push({
      id: p.id as string,
      type: p.type as PrintJobView['type'],
      status: p.status as PrintJobView['status'],
      copies: (p.copies as number) ?? 1,
      source: (p.source as string) ?? 'booth',
      errorReason: (p.error_reason as string) ?? null,
      createdAt: p.created_at as string,
    });
    printsBySession.set(p.session_id as string, list);
  }

  return rows.map((r) => {
    const shots: string[] = [];
    for (let i = 0; i < (r.shot_count ?? 3); i++) {
      const u = sessionUrl(r.id, `photo_${i}.jpg`);
      if (u) shots.push(u);
    }
    // strip.jpg since v4; the media route transparently falls back to the
    // legacy strip.png of older sessions.
    const strip = ['composed', 'printing', 'printed', 'completed', 'failed'].includes(r.status) ? sessionUrl(r.id, 'strip.jpg') : null;
    return {
      id: r.id,
      ...(opts.withToken ? { token: r.token } : {}),
      eventId: r.event_id,
      createdAt: r.created_at,
      status: r.status,
      frameName: r.frames?.name ?? null,
      kind: r.filter === 'zine' ? 'zine' : 'strip',
      shotCount: r.shot_count ?? 3,
      liveFrames: r.has_live ? r.live_frames ?? 0 : 0,
      isHidden: Boolean(r.is_hidden),
      printCount: r.print_count ?? 0,
      stripWidth: r.strip_width ?? null,
      stripHeight: r.strip_height ?? null,
      urls: {
        strip,
        thumb: r.has_thumb ? sessionUrl(r.id, 'thumb.jpg') : strip,
        gif: r.has_gif ? sessionUrl(r.id, 'anim.gif') : null,
        live: r.has_live ? sessionUrl(r.id, 'live.jpg') : null,
        sheet: sessionUrl(r.id, 'sheet.jpg'),
        shots,
      },
      ai: aiBySession.get(r.id) ?? [],
      printJobs: printsBySession.get(r.id) ?? [],
    };
  });
}

export async function isPrintStationOnline(supabase = createServerClient()): Promise<boolean> {
  const { data } = await supabase
    .from('print_station_heartbeat')
    .select('last_seen_at')
    .order('last_seen_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data?.last_seen_at) return false;
  return Date.now() - new Date(data.last_seen_at).getTime() < HEARTBEAT_ONLINE_THRESHOLD_MS;
}

/** Guest view of a session, authorised only by its 96-bit token. */
export async function getGuestSession(token: string): Promise<GuestSessionData | null> {
  if (!isSessionToken(token)) return null;
  const supabase = createServerClient();
  const { data: row } = await supabase.from('sessions').select(SESSION_COLUMNS).eq('token', token).maybeSingle();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const r = row as any;
  if (!r) return null;
  if (r.expires_at && new Date(r.expires_at).getTime() < Date.now()) return null;
  if (!['composed', 'printing', 'printed', 'completed'].includes(r.status)) return null;

  const [{ data: evRow }, [summary], online, settings, library] = await Promise.all([
    supabase.from('events').select(EVENT_COLUMNS).eq('id', r.event_id).maybeSingle(),
    buildSummaries(supabase, [r], { withPrintJobs: true }),
    isPrintStationOnline(supabase),
    getSettings(),
    stickerLibrary(),
  ]);
  if (!evRow) return null;
  const ev = mapEvent(evRow);
  const stickerPaths: string[] = ev.stickersEnabled ? ev.stickerPaths : [];
  const [stickerUrls, extras, aiPayment] = [mediaUrls(stickerPaths), await v4Extras(supabase, r.id), await paymentRequirement(ev, 'ai')];

  return {
    session: summary,
    event: {
      name: ev.name,
      code: ev.code,
      aiEnabled: ev.aiEnabled && settings.ai.enabled,
      aiStyles: ev.aiStyles,
      aiPerSession: ev.aiPerSession,
      printMode: ev.printMode,
      printPaper: ev.printPaper,
      maxGuestPrints: ev.maxGuestPrints,
      hasCustomStyle: Boolean(ev.activePromptTemplateId),
      aiGuestPrompt: ev.aiGuestPrompt,
      stickersEnabled: ev.stickersEnabled,
      stickers: stickerPaths.map((p) => stickerUrls.get(p)).filter((u): u is string => !!u),
      libraryStickers: ev.stickersEnabled ? library : [],
      guestbookToken: ev.guestbookEnabled ? ev.publicToken : null,
      liveEnabled: ev.liveEnabled,
      zineEnabled: ev.zineEnabled,
      aiPayment,
    },
    wallStickers: extras.wallStickers,
    aiConfigured: isAiConfigured(),
    printStationOnline: online,
    expiresAt: r.expires_at,
  };
}

/**
 * v4 column (wall stickers) read separately and tolerantly, so the app keeps
 * working before migration 0009 is applied.
 */
async function v4Extras(supabase: SupabaseClient, sessionId: string): Promise<{ wallStickers: WallSticker[] }> {
  const s = await supabase.from('sessions').select('wall_stickers').eq('id', sessionId).maybeSingle();
  return { wallStickers: s.error ? [] : sanitizeWallStickers(s.data?.wall_stickers) };
}

/** Deletes a session's files from storage (rows cascade on delete). */
export async function deleteSessionFiles(_supabase: SupabaseClient, sessionId: string) {
  await Promise.all([removeFolder('sessions', `sessions/${sessionId}`), removeFolder('sketches', `sketches/${sessionId}`)]);
}
