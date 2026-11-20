'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Copy, ExternalLink, Images } from 'lucide-react';
import { PageHeader } from '@/components/shell/PortalShell';
import { Button } from '@/components/ui/button';
import { Segmented } from '@/components/ui/segmented';
import { EmptyState } from '@/components/ui/empty-state';
import { Spinner } from '@/components/ui/spinner';
import { useToast } from '@/components/ui/toast';
import { SessionGrid, SessionLightbox } from '@/components/gallery/SessionGallery';
import type { EventConfig } from '@/lib/events';
import type { SessionSummary } from '@/lib/session-types';
import { useEventSessions, type Range } from './useEventSessions';

export function EventGallery({ event }: { event: EventConfig }) {
  const toast = useToast();
  const [range, setRange] = useState<Range>('all');
  const { sessions, loading, loadingMore, nextOffset, loadMore, reload, total } = useEventSessions(event.code, range, '', 36);
  const [open, setOpen] = useState<SessionSummary | null>(null);
  const sentinel = useRef<HTMLDivElement>(null);

  // Infinite scroll
  useEffect(() => {
    const el = sentinel.current;
    if (!el || nextOffset === null) return;
    const io = new IntersectionObserver(([e]) => e.isIntersecting && !loadingMore && void loadMore(), { rootMargin: '600px' });
    io.observe(el);
    return () => io.disconnect();
  }, [nextOffset, loadMore, loadingMore]);

  const shareUrl = typeof window !== 'undefined' ? `${window.location.origin}/g/${event.galleryToken}` : '';

  return (
    <div>
      <PageHeader
        title="Galeri Event"
        description={`${total} sesi · semua foto dari booth event ini. Arahkan kursor untuk melihat versi Live.`}
        actions={
          event.galleryVisibility !== 'private' ? (
            <>
              <Button variant="secondary" onClick={() => navigator.clipboard.writeText(shareUrl).then(() => toast('Link galeri disalin'))}><Copy /> Salin link galeri</Button>
              <a href={shareUrl} target="_blank" rel="noreferrer"><Button variant="ghost"><ExternalLink /> Lihat sebagai tamu</Button></a>
            </>
          ) : null
        }
      />
      <Segmented<Range> className="mb-4" value={range} onChange={setRange} options={[{ value: 'all', label: 'Semua' }, { value: 'today', label: 'Hari ini' }, { value: 'week', label: '7 hari' }]} />
      {loading && !sessions.length ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6">{Array.from({ length: 12 }).map((_, i) => <div key={i} className="skeleton aspect-[3/4] rounded-[12px]" />)}</div>
      ) : sessions.length ? (
        <SessionGrid sessions={sessions} onOpen={setOpen} />
      ) : (
        <EmptyState icon={<Images />} title="Galeri masih kosong" description="Foto dari booth event ini akan muncul di sini." />
      )}
      <div ref={sentinel} className="flex justify-center py-6">{loadingMore ? <Spinner className="text-muted" /> : null}</div>
      <SessionLightbox session={open} onClose={() => setOpen(null)} manage={{ code: event.code, onChanged: () => { setOpen(null); void reload(); } }} printPaper={event.printPaper} />
    </div>
  );
}
