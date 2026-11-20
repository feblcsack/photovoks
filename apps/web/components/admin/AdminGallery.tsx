'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronLeft, ChevronRight, Images } from 'lucide-react';
import { PageHeader } from '@/components/shell/PortalShell';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/field';
import { EmptyState } from '@/components/ui/empty-state';
import { SessionGrid, SessionLightbox } from '@/components/gallery/SessionGallery';
import type { SessionSummary } from '@/lib/session-types';

export function AdminGallery({ sessions, events, page, pages, total, eventFilter }: { sessions: SessionSummary[]; events: Array<{ id: string; code: string; name: string; print_paper: string }>; page: number; pages: number; total: number; eventFilter: string }) {
  const router = useRouter();
  const [open, setOpen] = useState<SessionSummary | null>(null);
  const byId = useMemo(() => new Map(events.map((e) => [e.id, e])), [events]);
  const ev = open ? byId.get(open.eventId) : null;
  const href = (p: number, e = eventFilter) => `/admin/gallery?page=${p}${e ? `&event=${e}` : ''}`;

  return (
    <div>
      <PageHeader
        title="Galeri"
        description={`${total} sesi dari semua event. Hanya pemilik yang melihat halaman ini — visibilitas publik diatur per event.`}
        actions={
          <Select value={eventFilter} onChange={(e) => router.push(href(1, e.target.value))} className="w-auto min-w-52">
            <option value="">Semua event</option>
            {events.map((e) => <option key={e.id} value={e.code}>{e.name} · {e.code}</option>)}
          </Select>
        }
      />
      {sessions.length ? <SessionGrid sessions={sessions} onOpen={setOpen} /> : <EmptyState icon={<Images />} title="Belum ada foto" />}
      {pages > 1 ? (
        <div className="mt-6 flex items-center justify-center gap-3">
          <Link href={href(Math.max(1, page - 1))} aria-disabled={page <= 1} className={page <= 1 ? 'pointer-events-none opacity-40' : ''}><Button variant="secondary" size="sm"><ChevronLeft /> Sebelumnya</Button></Link>
          <span className="text-sm text-muted">Hal. {page} / {pages}</span>
          <Link href={href(Math.min(pages, page + 1))} aria-disabled={page >= pages} className={page >= pages ? 'pointer-events-none opacity-40' : ''}><Button variant="secondary" size="sm">Berikutnya <ChevronRight /></Button></Link>
        </div>
      ) : null}
      <SessionLightbox session={open} onClose={() => setOpen(null)} manage={ev ? { code: ev.code, onChanged: () => { setOpen(null); router.refresh(); } } : undefined} printPaper={ev?.print_paper} />
    </div>
  );
}
