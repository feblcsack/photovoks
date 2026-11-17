/**
 * Session status lookup by public session token (SERVER ONLY).
 *
 * Used by GET /api/sessions/[token]/status and the /s/[token] page.
 * The token (96-bit random) is the only credential; unknown/expired tokens
 * return null so callers can respond with a generic 404.
 */
import { createServerClient } from '@/lib/supabase/server';
import { isSessionToken } from '@/lib/security';
import { isGeminiConfigured } from '@/lib/sketch/gemini';
import type { SketchJobStatus, LivePhotoStatus, PrintJobStatus } from '@photovoks/shared-types';

/** Print station counts as online if its heartbeat is fresher than this. */
export const HEARTBEAT_ONLINE_THRESHOLD_MS = 90_000;

export interface SessionStatusData {
  session: {
    id: string;
    status: string;
    livePhotoStatus: LivePhotoStatus;
    expiresAt: string | null;
    createdAt: string;
    stripSignedUrl: string | null;
  };
  sketchJob: {
    id: string;
    status: SketchJobStatus;
    errorReason: string | null;
    retryCount: number;
    cardSignedUrl: string | null;
  } | null;
  printJob: { id: string; status: PrintJobStatus } | null;
  sketchPrintJob: { id: string; status: PrintJobStatus } | null;
  printStationOnline: boolean;
  aiEnabled: boolean;
}

export async function isPrintStationOnline(): Promise<boolean> {
  const supabase = createServerClient();
  const { data } = await supabase
    .from('print_station_heartbeat')
    .select('last_seen_at')
    .order('last_seen_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data?.last_seen_at) return false;
  return Date.now() - new Date(data.last_seen_at).getTime() < HEARTBEAT_ONLINE_THRESHOLD_MS;
}

export async function getSessionStatusByToken(token: string): Promise<SessionStatusData | null> {
  if (!isSessionToken(token)) return null;
  const supabase = createServerClient();

  const { data: session } = await supabase
    .from('sessions')
    .select('id, status, live_photo_status, expires_at, created_at')
    .eq('token', token)
    .maybeSingle();

  if (!session) return null;
  if (session.expires_at && new Date(session.expires_at).getTime() < Date.now()) return null;

  const sessionId: string = session.id;

  const [sketchRes, printRes, stripUrlRes, online] = await Promise.all([
    supabase
      .from('sketch_jobs')
      .select('id, status, card_path, error_reason, retry_count')
      .eq('session_id', sessionId)
      .maybeSingle(),
    supabase.from('print_jobs').select('id, type, status').eq('session_id', sessionId),
    supabase.storage.from('sessions').createSignedUrl(`sessions/${sessionId}/strip.png`, 3600),
    isPrintStationOnline(),
  ]);

  const sketch = sketchRes.data;
  let cardSignedUrl: string | null = null;
  if (sketch?.status === 'done' && sketch.card_path) {
    const { data } = await supabase.storage.from('sketches').createSignedUrl(sketch.card_path, 3600);
    cardSignedUrl = data?.signedUrl ?? null;
  }

  const jobs = (printRes.data ?? []) as Array<{ id: string; type: string; status: PrintJobStatus }>;
  const strip = jobs.find((j) => j.type === 'strip');
  const sketchPrint = jobs.find((j) => j.type === 'sketch');

  return {
    session: {
      id: sessionId,
      status: session.status,
      livePhotoStatus: session.live_photo_status,
      expiresAt: session.expires_at,
      createdAt: session.created_at,
      stripSignedUrl: stripUrlRes.data?.signedUrl ?? null,
    },
    sketchJob: sketch
      ? {
          id: sketch.id,
          status: sketch.status,
          errorReason: sketch.error_reason,
          retryCount: sketch.retry_count,
          cardSignedUrl,
        }
      : null,
    printJob: strip ? { id: strip.id, status: strip.status } : null,
    sketchPrintJob: sketchPrint ? { id: sketchPrint.id, status: sketchPrint.status } : null,
    printStationOnline: online,
    aiEnabled: isGeminiConfigured(),
  };
}
