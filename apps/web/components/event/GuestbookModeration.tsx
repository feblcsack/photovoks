'use client';

import React, { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { Eye, EyeOff, ExternalLink, MessageSquareText, Monitor, Trash2 } from 'lucide-react';
import { PageHeader } from '@/components/shell/PortalShell';
import { Panel } from '@/components/ui/panel';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ConfirmDialog } from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { useToast } from '@/components/ui/toast';
import { api, timeAgo } from '@/lib/fetcher';
import type { GuestbookEntryView } from '@/lib/community';
import { cn } from '@/lib/utils';
import { variant } from '@/lib/media-variant';

const noopSubscribe = () => () => {};

export function GuestbookModeration({ code, enabled, liveEnabled, publicToken }: { code: string; enabled: boolean; liveEnabled: boolean; publicToken: string }) {
  const toast = useToast();
  const origin = useSyncExternalStore(noopSubscribe, () => window.location.origin, () => '');
  const [entries, setEntries] = useState<GuestbookEntryView[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirm, setConfirm] = useState<GuestbookEntryView | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await api<{ entries: GuestbookEntryView[] }>(`/api/events/${code}/guestbook`);
      setEntries(res.entries);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Gagal memuat', 'error');
    } finally {
      setLoading(false);
    }
  }, [code, toast]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data fetch + polling
    void load();
    const t = setInterval(() => {
      if (!document.hidden) void load();
    }, 15_000);
    return () => clearInterval(t);
  }, [load]);

  async function setHidden(e: GuestbookEntryView, hidden: boolean) {
    setEntries((xs) => xs.map((x) => (x.id === e.id ? { ...x, hidden } : x)));
    try {
      await api(`/api/events/${code}/guestbook`, { method: 'PATCH', json: { id: e.id, hidden } });
    } catch {
      toast('Gagal menyimpan', 'error');
      void load();
    }
  }

  async function remove(e: GuestbookEntryView) {
    try {
      await api(`/api/events/${code}/guestbook`, { method: 'DELETE', json: { id: e.id } });
      setEntries((xs) => xs.filter((x) => x.id !== e.id));
      toast('Pesan dihapus');
    } catch {
      toast('Gagal menghapus', 'error');
    } finally {
      setConfirm(null);
    }
  }

  return (
    <div>
      <PageHeader
        title="Buku Tamu"
        description="Pesan & foto dari tamu. Sembunyikan pesan yang tidak pantas — langsung hilang dari microsite dan galeri live."
        actions={
          enabled ? (
            <>
              {liveEnabled ? <a href={`/live/${publicToken}`} target="_blank" rel="noreferrer"><Button variant="secondary"><Monitor /> Galeri live</Button></a> : null}
              <a href={`${origin}/m/${publicToken}`} target="_blank" rel="noreferrer"><Button variant="secondary"><ExternalLink /> Buka buku tamu</Button></a>
            </>
          ) : null
        }
      />
      {!enabled ? (
        <Panel>
          <EmptyState
            icon={<MessageSquareText />}
            title="Buku tamu belum aktif"
            description="Aktifkan di Pengaturan Booth › Galeri, live & buku tamu. Tamu akan mendapat link di halaman softfile mereka."
            action={<Link href={`/event/${code}/booth#galeri`}><Button variant="primary">Buka pengaturan</Button></Link>}
          />
        </Panel>
      ) : loading ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="skeleton h-36 rounded-panel" />)}</div>
      ) : !entries.length ? (
        <Panel><EmptyState icon={<MessageSquareText />} title="Belum ada pesan" description="Pesan baru muncul di sini otomatis." /></Panel>
      ) : (
        <div className="columns-1 gap-3 sm:columns-2 xl:columns-3">
          {entries.map((e) => (
            <article key={e.id} className={cn('mb-3 break-inside-avoid overflow-hidden rounded-panel border border-line bg-surface shadow-panel', e.hidden && 'opacity-55')}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {e.photo ? <img src={variant(e.photo, { w: 480 })} alt="" loading="lazy" className="max-h-64 w-full object-cover" /> : null}
              <div className="p-4">
                <p className="text-sm leading-relaxed whitespace-pre-line">{e.message}</p>
                <div className="mt-3 flex items-center justify-between gap-2">
                  <p className="min-w-0 truncate text-xs"><b>{e.name}</b> <span className="text-muted">· {timeAgo(e.createdAt)}</span></p>
                  <div className="flex shrink-0 items-center gap-1">
                    {e.hidden ? <Badge tone="neutral">Disembunyikan</Badge> : null}
                    <Button size="icon-sm" variant="ghost" onClick={() => void setHidden(e, !e.hidden)} aria-label={e.hidden ? 'Tampilkan' : 'Sembunyikan'}>{e.hidden ? <Eye /> : <EyeOff />}</Button>
                    <Button size="icon-sm" variant="danger-ghost" onClick={() => setConfirm(e)} aria-label="Hapus"><Trash2 /></Button>
                  </div>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
      <ConfirmDialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)} title="Hapus pesan ini?" description="Pesan dan fotonya dihapus permanen." confirmLabel="Hapus" onConfirm={() => confirm && void remove(confirm)} />
    </div>
  );
}
