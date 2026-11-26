/**
 * Session data access (SERVER ONLY): summaries with signed media URLs.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { createServerClient } from '@/lib/supabase/server';
import { isSessionToken } from '@/lib/security';
import { signMedia } from '@/lib/event-media';
import { isAiConfigured } from '@/lib/ai/provider';
import type { AiGenerationView, GuestSessionData, PrintJobView, SessionSummary } from '@/lib/session-types';
import { sanitizeWallStickers, type WallSticker } from '@/lib/y2k-stickers';

export const HEARTBEAT_ONLINE_THRESHOLD_MS = 90_000;

export const SESSION_COLUMNS =
  'id, token, event_id, frame_id, status, created_at, expires_at, shot_count, live_frames, has_live, has_gif, has_thumb, ' +
  'is_hidden, print_count, strip_width, strip_height, filter, frames(name)';

export const MEDIA_TTL_SECONDS = 3600;

export function sessionPath(sessionId: string, file: string) {
  return `sessions/${sessionId}/${file}`;
}

async function signMany(supabase: SupabaseClient, bucket: string, paths: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  for (let i = 0; i < paths.length; i += 500) {
    const chunk = paths.slice(i, i + 500);
    if (!chunk.length) continue;
    const { data } = await supabase.storage.from(bucket).createSignedUrls(chunk, MEDIA_TTL_SECONDS);
    data?.forEach((e) => {
      if (e.path && e.signedUrl && !e.error) map.set(e.path, e.signedUrl);
    });
  }
  return map;
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

  const [aiRes, printRes] = await Promise.all([
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
  ]);
  // Legacy single "sketch" results (pre-v2) are shown as an AI result too.
  const { data: legacySketches } = await supabase
    .from('sketch_jobs')
    .select('id, session_id, status, card_path, error_reason, created_at')
    .in('session_id', ids);

  const sessionPaths: string[] = [];
  for (const r of rows) {
    const shots = r.shot_count ?? 3;
    sessionPaths.push(sessionPath(r.id, 'strip.jpg'), sessionPath(r.id, 'strip.png'), sessionPath(r.id, 'sheet.jpg'));
    if (r.has_thumb) sessionPaths.push(sessionPath(r.id, 'thumb.jpg'));
    if (r.has_gif) sessionPaths.push(sessionPath(r.id, 'anim.gif'));
    if (r.has_live) sessionPaths.push(sessionPath(r.id, 'live.jpg'));
    for (let i = 0; i < shots; i++) sessionPaths.push(sessionPath(r.id, `photo_${i}.jpg`));
  }
  const aiRows = (aiRes.data ?? []).filter((a) => !opts.onlyDoneAi || a.status === 'done');
  const sketchPaths = [
    ...aiRows.filter((a) => a.result_path).map((a) => a.result_path as string),
    ...(legacySketches ?? []).filter((s) => s.status === 'done' && s.card_path).map((s) => s.card_path as string),
  ];

  const [sessionUrls, sketchUrls] = await Promise.all([
    signMany(supabase, 'sessions', sessionPaths),
    signMany(supabase, 'sketches', sketchPaths),
  ]);

  const aiBySession = new Map<string, AiGenerationView[]>();
  for (const s of legacySketches ?? []) {
    if (opts.onlyDoneAi && s.status !== 'done') continue;
    const list = aiBySession.get(s.session_id) ?? [];
    list.push({
      id: s.id,
      styleId: 'doodle',
      shotIndex: 0,
      status: s.status,
      url: s.card_path ? sketchUrls.get(s.card_path) ?? null : null,
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
      url: a.result_path ? sketchUrls.get(a.result_path) ?? null : null,
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
      const u = sessionUrls.get(sessionPath(r.id, `photo_${i}.jpg`));
      if (u) shots.push(u);
    }
    const strip = sessionUrls.get(sessionPath(r.id, 'strip.jpg')) ?? sessionUrls.get(sessionPath(r.id, 'strip.png')) ?? null;
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
        thumb: sessionUrls.get(sessionPath(r.id, 'thumb.jpg')) ?? strip,
        gif: sessionUrls.get(sessionPath(r.id, 'anim.gif')) ?? null,
        live: sessionUrls.get(sessionPath(r.id, 'live.jpg')) ?? null,
        sheet: sessionUrls.get(sessionPath(r.id, 'sheet.jpg')) ?? null,
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

  const [{ data: ev }, [summary], online] = await Promise.all([
    supabase
      .from('events')
      .select('id, name, code, ai_enabled, ai_styles, ai_per_session, print_mode, print_paper, max_guest_prints, active_prompt_template_id, ai_guest_prompt, stickers_enabled, sticker_paths, guestbook_enabled, live_enabled, public_token')
      .eq('id', r.event_id)
      .maybeSingle(),
    buildSummaries(supabase, [r], { withPrintJobs: true }),
    isPrintStationOnline(supabase),
  ]);
  if (!ev) return null;
  const stickerPaths: string[] = ev.stickers_enabled ? ev.sticker_paths ?? [] : [];
  const [stickerUrls, extras] = await Promise.all([signMedia(supabase, stickerPaths, 6 * 3600), v4Extras(supabase, r.id, r.event_id)]);

  return {
    session: summary,
    event: {
      name: ev.name,
      code: ev.code,
      aiEnabled: ev.ai_enabled,
      aiStyles: ev.ai_styles ?? [],
      aiPerSession: ev.ai_per_session ?? 3,
      printMode: ev.print_mode,
      printPaper: ev.print_paper,
      maxGuestPrints: ev.max_guest_prints ?? 0,
      hasCustomStyle: Boolean(ev.active_prompt_template_id),
      aiGuestPrompt: Boolean(ev.ai_guest_prompt),
      stickersEnabled: ev.stickers_enabled ?? true,
      stickers: stickerPaths.map((p) => stickerUrls.get(p)).filter((u): u is string => !!u),
      guestbookToken: ev.guestbook_enabled ? ev.public_token : null,
      liveEnabled: !!ev.live_enabled,
      zineEnabled: extras.zineEnabled,
    },
    wallStickers: extras.wallStickers,
    aiConfigured: isAiConfigured(),
    printStationOnline: online,
    expiresAt: r.expires_at,
  };
}

/**
 * v4 columns (wall stickers, zine switch) read separately and tolerantly, so
 * the app keeps working before migration 0009 is applied.
 */
async function v4Extras(supabase: SupabaseClient, sessionId: string, eventId: string): Promise<{ wallStickers: WallSticker[]; zineEnabled: boolean }> {
  const [s, e] = await Promise.all([
    supabase.from('sessions').select('wall_stickers').eq('id', sessionId).maybeSingle(),
    supabase.from('events').select('zine_enabled').eq('id', eventId).maybeSingle(),
  ]);
  return {
    wallStickers: s.error ? [] : sanitizeWallStickers(s.data?.wall_stickers),
    zineEnabled: e.error ? true : e.data?.zine_enabled !== false,
  };
}

/** Deletes a session's files from storage (rows cascade on delete). */
export async function deleteSessionFiles(supabase: SupabaseClient, sessionId: string) {
  const { data: files } = await supabase.storage.from('sessions').list(`sessions/${sessionId}`, { limit: 100 });
  if (files?.length) await supabase.storage.from('sessions').remove(files.map((f) => `sessions/${sessionId}/${f.name}`));
  const { data: sk } = await supabase.storage.from('sketches').list(`sketches/${sessionId}`, { limit: 100 });
  if (sk?.length) await supabase.storage.from('sketches').remove(sk.map((f) => `sketches/${sessionId}/${f.name}`));
}
