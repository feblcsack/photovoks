/**
 * Session Page — `/s/[token]`
 *
 * Server Component that fetches the initial session data and passes it to
 * the SessionView client component. The token acts as the bearer credential
 * (unguessable, high-entropy) so no additional auth is needed.
 *
 * On an unknown or expired token, calls `notFound()` which renders the
 * nearest `not-found.tsx` — no session data is leaked in the response.
 *
 * Requirements: 8.1, 8.11, 8.12
 */
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { SessionView } from '@/components/session/SessionView';
import type { SketchJobStatus, LivePhotoStatus, PrintJobStatus } from '@photovoks/shared-types';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SessionStatusData {
  session: {
    id: string;
    eventId: string;
    status: string;
    livePhotoStatus: LivePhotoStatus;
    expiresAt: string | null;
    createdAt: string;
    updatedAt: string;
    /** Signed URL for the strip image — may be null if not yet composed */
    stripSignedUrl: string | null;
  };
  sketchJob: {
    id: string;
    status: SketchJobStatus;
    result_path: string | null;
    card_path: string | null;
    error_reason: string | null;
    retry_count: number;
    /** Signed URL for the sketch card — populated when status is 'done' */
    cardSignedUrl: string | null;
  } | null;
  printJob: {
    id: string;
    type: 'strip' | 'sketch';
    status: PrintJobStatus;
    error_reason: string | null;
  } | null;
  printStationOnline: boolean;
}

type RouteContext = { params: Promise<{ token: string }> };

// ── Metadata ──────────────────────────────────────────────────────────────────

export const metadata: Metadata = {
  title: 'Foto Anda — Photovoks',
  description: 'Lihat strip foto dan sketsa AI Anda dari Photovoks.',
};

// ── Data fetching ─────────────────────────────────────────────────────────────

async function fetchSessionStatus(token: string): Promise<SessionStatusData> {
  // NOTE: the old expression `A ?? B ? x : y` parsed as `(A ?? B) ? x : y`, which
  // produced "https://undefined" whenever NEXT_PUBLIC_BASE_URL was set.
  const baseUrl =
    process.env.NEXT_PUBLIC_BASE_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');
  const res = await fetch(`${baseUrl}/api/sessions/${token}/status`, {
    // Each request fetches fresh data; no stale cache on session pages
    cache: 'no-store',
  });

  if (!res.ok) {
    // Any non-2xx (including 404) triggers the generic not-found page
    return Promise.reject(new Error(`status ${res.status}`));
  }

  return res.json() as Promise<SessionStatusData>;
}

// ── Page Component ────────────────────────────────────────────────────────────

export default async function SessionPage({ params }: RouteContext) {
  const { token } = await params;

  let initialData: SessionStatusData;
  try {
    initialData = await fetchSessionStatus(token);
  } catch {
    // Requirement 8.11: generic not-found, no token details leaked
    notFound();
  }

  return (
    <main className="min-h-screen w-full" style={{ fontFamily: 'var(--font-body), sans-serif' }}>
      <SessionView
        initialData={initialData}
        token={token}
        sessionId={initialData.session.id}
      />
    </main>
  );
}
