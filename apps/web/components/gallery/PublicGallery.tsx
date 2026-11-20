'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Aperture, Images } from 'lucide-react';
import { SessionGrid, SessionLightbox } from './SessionGallery';
import type { SessionSummary } from '@/lib/session-types';

export function PublicGallery({ title, sessions, total, page, pages, basePath }: { title: string; sessions: SessionSummary[]; total: number; page: number; pages: number; basePath: string }) {
  const [open, setOpen] = useState<SessionSummary | null>(null);
  return (
    <main className="mx-auto min-h-dvh max-w-7xl px-4 py-6 sm:px-6">
      <header className="mb-6 flex items-center justify-between gap-4">
        <div>
          <Link href="/gallery" className="mb-1 flex items-center gap-1.5 text-xs font-bold tracking-widest text-muted uppercase"><Aperture className="size-3.5" /> Photovoks</Link>
          <h1 className="text-2xl font-extrabold tracking-tight">{title}</h1>
          <p className="text-sm text-muted">{total} sesi · ketuk foto untuk melihat versi Live & mengunduh</p>
        </div>
      </header>
      {sessions.length ? <SessionGrid sessions={sessions} onOpen={setOpen} /> : <div className="flex flex-col items-center gap-2 py-20 text-muted"><Images className="size-7" /><p className="text-sm">Belum ada foto.</p></div>}
      {pages > 1 ? (
        <nav className="mt-8 flex justify-center gap-2 text-sm">
          {Array.from({ length: pages }).map((_, i) => (
            <Link key={i} href={`${basePath}?page=${i + 1}`} className={`flex size-9 items-center justify-center rounded-ctl font-semibold ${page === i + 1 ? 'bg-ink text-white' : 'bg-surface text-ink-2 hover:bg-ink/5'}`}>{i + 1}</Link>
          ))}
        </nav>
      ) : null}
      <SessionLightbox session={open} onClose={() => setOpen(null)} />
    </main>
  );
}
