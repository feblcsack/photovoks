/**
 * Session Page — `/s/[token]` (the QR-code destination on the visitor's phone).
 *
 * Fetches initial data server-side (directly, no self-HTTP call) and hands off
 * to SessionView, which polls the status API for live updates.
 * Unknown/expired tokens render the generic not-found page.
 */
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { SessionView } from '@/components/session/SessionView';
import { getSessionStatusByToken } from '@/lib/session-status';

export type { SessionStatusData } from '@/lib/session-status';

type RouteContext = { params: Promise<{ token: string }> };

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Foto Kamu — Photovoks',
  description: 'Unduh photostrip dan buat doodle AI dari fotomu.',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

export default async function SessionPage({ params }: RouteContext) {
  const { token } = await params;
  const initialData = await getSessionStatusByToken(token);
  if (!initialData) notFound();

  return (
    <main className="min-h-screen w-full" style={{ fontFamily: 'var(--font-body), sans-serif' }}>
      <SessionView initialData={initialData} token={token} />
    </main>
  );
}
