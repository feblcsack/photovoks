'use client';

import React, { useState } from 'react';
import { Download, ExternalLink, EyeOff, Eye, Film, ImageIcon, Images, Printer, Sparkles, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog, Dialog } from '@/components/ui/dialog';
import { Segmented } from '@/components/ui/segmented';
import { useToast } from '@/components/ui/toast';
import { PrintDialog } from '@/components/print/PrintDialog';
import { api, formatDateTime, timeAgo } from '@/lib/fetcher';
import { AI_STYLES } from '@/lib/ai/styles';
import type { SessionSummary } from '@/lib/session-types';
import { cn } from '@/lib/utils';
import { LivePlayer } from './LivePlayer';

// ── Grid ─────────────────────────────────────────────────────────────────────

export function SessionGrid({ sessions, onOpen, dense = false }: { sessions: SessionSummary[]; onOpen: (s: SessionSummary) => void; dense?: boolean }) {
  return (
    <div className={cn('grid gap-3', dense ? 'grid-cols-3 sm:grid-cols-4 2xl:grid-cols-6' : 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6')}>
      {sessions.map((s) => (
        <SessionCard key={s.id} session={s} onOpen={() => onOpen(s)} />
      ))}
    </div>
  );
}

function SessionCard({ session, onOpen }: { session: SessionSummary; onOpen: () => void }) {
  const [hover, setHover] = useState(false);
  const aiDone = session.ai.filter((a) => a.status === 'done').length;
  const src = hover && session.urls.gif ? session.urls.gif : session.urls.thumb;
  return (
    <button
      type="button"
      onClick={onOpen}
      onPointerEnter={(e) => e.pointerType === 'mouse' && setHover(true)}
      onPointerLeave={() => setHover(false)}
      onFocus={() => setHover(true)}
      onBlur={() => setHover(false)}
      className={cn('group relative flex aspect-[3/4] items-center justify-center overflow-hidden rounded-[12px] border border-line bg-[#EEF0F4] text-left transition hover:border-line-strong hover:shadow-pop', session.isHidden && 'opacity-55')}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" loading="lazy" decoding="async" className="max-h-full max-w-full object-contain" />
      ) : (
        <ImageIcon className="size-6 text-faint" />
      )}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between gap-1 bg-gradient-to-t from-black/55 to-transparent px-2 pt-6 pb-1.5 text-[11px] font-semibold text-white">
        <span>{timeAgo(session.createdAt)}</span>
        <span className="flex gap-1">
          {session.urls.gif ? <span className="rounded bg-white/25 px-1 backdrop-blur">LIVE</span> : null}
          {aiDone ? <span className="rounded bg-ai/80 px-1">AI {aiDone}</span> : null}
          {session.isHidden ? <span className="rounded bg-black/50 px-1">disembunyikan</span> : null}
        </span>
      </div>
    </button>
  );
}

// ── Lightbox ─────────────────────────────────────────────────────────────────

type Tab = 'strip' | 'live' | 'shots' | 'ai';

export function SessionLightbox({ session, onClose, manage, printPaper = '4x6' }: {
  session: SessionSummary | null;
  onClose: () => void;
  /** Manager actions (event code) — omit for read-only galleries. */
  manage?: { code: string; onChanged: () => void };
  printPaper?: string;
}) {
  const toast = useToast();
  const [tab, setTab] = useState<Tab>('strip');
  const [printSrc, setPrintSrc] = useState<{ url: string; type: 'strip' | 'ai'; aiId?: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!session) return null;
  const s = session;
  const aiDone = s.ai.filter((a) => a.status === 'done' && a.url);
  const tabs: Array<{ value: Tab; label: React.ReactNode }> = [
    { value: 'strip', label: <><ImageIcon className="size-3.5" /> Hasil</> },
    ...(s.urls.gif || s.urls.live ? [{ value: 'live' as Tab, label: <><Film className="size-3.5" /> Live</> }] : []),
    { value: 'shots', label: <><Images className="size-3.5" /> Foto ({s.urls.shots.length})</> },
    ...(aiDone.length ? [{ value: 'ai' as Tab, label: <><Sparkles className="size-3.5" /> AI ({aiDone.length})</> }] : []),
  ];

  async function toggleHidden() {
    if (!manage) return;
    setBusy(true);
    try {
      await api(`/api/events/${manage.code}/sessions/${s.id}`, { method: 'PATCH', json: { hidden: !s.isHidden } });
      toast(s.isHidden ? 'Ditampilkan di galeri' : 'Disembunyikan dari galeri bersama');
      manage.onChanged();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Gagal', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!manage) return;
    setBusy(true);
    try {
      await api(`/api/events/${manage.code}/sessions/${s.id}`, { method: 'DELETE' });
      toast('Sesi dihapus');
      setConfirmDelete(false);
      onClose();
      manage.onChanged();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Gagal menghapus', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function queuePrint(type: 'strip' | 'ai', aiId?: string) {
    if (!manage) return;
    try {
      await api(`/api/events/${manage.code}/sessions/${s.id}`, { method: 'POST', json: { type, aiId, copies: 1 } });
      toast('Ditambahkan ke antrean print station');
      setPrintSrc(null);
      manage.onChanged();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Gagal', 'error');
    }
  }

  return (
    <>
      <Dialog
        open
        onOpenChange={(o) => !o && onClose()}
        size="xl"
        title={formatDateTime(s.createdAt)}
        description={[s.frameName, `${s.shotCount} foto`, s.printCount ? `dicetak ${s.printCount}×` : null].filter(Boolean).join(' · ')}
        footer={
          <>
            {manage ? (
              <div className="mr-auto flex gap-1">
                <Button variant="ghost" size="sm" onClick={toggleHidden} disabled={busy}>
                  {s.isHidden ? <Eye /> : <EyeOff />} {s.isHidden ? 'Tampilkan' : 'Sembunyikan'}
                </Button>
                <Button variant="danger-ghost" size="sm" onClick={() => setConfirmDelete(true)} disabled={busy}>
                  <Trash2 /> Hapus
                </Button>
              </div>
            ) : null}
            {s.token ? (
              <a href={`/s/${s.token}`} target="_blank" rel="noreferrer">
                <Button variant="secondary" size="sm"><ExternalLink /> Halaman tamu</Button>
              </a>
            ) : null}
            {s.urls.strip ? (
              <a href={s.urls.strip} target="_blank" rel="noreferrer" download>
                <Button variant="secondary" size="sm"><Download /> Unduh</Button>
              </a>
            ) : null}
            {manage && s.urls.strip ? (
              <Button variant="primary" size="sm" onClick={() => setPrintSrc({ url: s.urls.strip!, type: 'strip' })}><Printer /> Cetak</Button>
            ) : null}
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Segmented value={tab} onChange={setTab} options={tabs} className="self-start" />
          {tab === 'strip' ? (
            <div className="flex justify-center rounded-[12px] bg-[#EEF0F4] p-4">
              {s.urls.strip ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={s.urls.strip} alt="Hasil" className="max-h-[62vh] w-auto rounded-[4px] shadow-[0_10px_30px_-12px_rgba(0,0,0,0.4)]" />
              ) : (
                <p className="py-20 text-sm text-muted">File tidak tersedia</p>
              )}
            </div>
          ) : null}
          {tab === 'live' ? (
            <div className="grid gap-4 md:grid-cols-2">
              {s.urls.gif ? (
                <div className="flex flex-col items-center gap-2 rounded-[12px] bg-[#EEF0F4] p-4">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={s.urls.gif} alt="Live" className="max-h-[54vh] w-auto rounded-[4px]" />
                  <a href={s.urls.gif} target="_blank" rel="noreferrer" download className="text-xs font-semibold text-brand">Unduh GIF</a>
                </div>
              ) : null}
              {s.urls.live && s.liveFrames ? (
                <div>
                  <p className="mb-2 text-xs font-bold tracking-wider text-muted uppercase">Live per foto · atur kecepatan</p>
                  <LivePlayer spriteUrl={s.urls.live} frames={s.liveFrames} shots={s.shotCount} className="max-w-sm" />
                </div>
              ) : null}
            </div>
          ) : null}
          {tab === 'shots' ? (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
              {s.urls.shots.map((u, i) => (
                <a key={u} href={u} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-[10px] bg-canvas">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={u} alt={`Foto ${i + 1}`} loading="lazy" className="aspect-[3/4] w-full object-cover" />
                </a>
              ))}
            </div>
          ) : null}
          {tab === 'ai' ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
              {aiDone.map((a) => (
                <div key={a.id} className="overflow-hidden rounded-[12px] border border-line">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={a.url!} alt="" loading="lazy" className="aspect-[3/4] w-full object-cover" />
                  <div className="flex items-center justify-between gap-1 px-2 py-1.5">
                    <Badge tone="ai">{AI_STYLES.find((x) => x.id === a.styleId)?.label ?? 'Gaya Event'}</Badge>
                    <div className="flex">
                      <a href={a.url!} target="_blank" rel="noreferrer" download className="flex size-8 items-center justify-center rounded-[8px] text-muted hover:bg-ink/5" aria-label="Unduh"><Download className="size-4" /></a>
                      {manage ? (
                        <button type="button" onClick={() => setPrintSrc({ url: a.url!, type: 'ai', aiId: a.id })} className="flex size-8 items-center justify-center rounded-[8px] text-muted hover:bg-ink/5" aria-label="Cetak"><Printer className="size-4" /></button>
                      ) : null}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : null}
          {manage && s.printJobs.length ? (
            <div className="rounded-[12px] border border-line px-4 py-3">
              <p className="mb-2 text-xs font-bold tracking-wider text-muted uppercase">Riwayat cetak</p>
              <ul className="flex flex-col gap-1.5 text-sm">
                {s.printJobs.slice(0, 6).map((j) => (
                  <li key={j.id} className="flex items-center justify-between gap-3">
                    <span className="text-ink-2">{j.type === 'ai' ? 'AI' : 'Foto'} · {j.copies} lembar · {j.source}</span>
                    <PrintStatusBadge status={j.status} />
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </Dialog>

      <PrintDialog
        open={!!printSrc}
        onOpenChange={(o) => !o && setPrintSrc(null)}
        source={printSrc?.url ?? null}
        defaultPaper={printPaper}
        secondaryAction={manage && printSrc ? <Button variant="secondary" onClick={() => queuePrint(printSrc.type, printSrc.aiId)}>Kirim ke antrean</Button> : null}
        onPrinted={async ({ copies, paper }) => {
          if (!printSrc || !s.token) return;
          await api(`/api/s/${s.token}/print`, { method: 'POST', json: { mode: 'browser', type: printSrc.type, copies, paper } }).catch(() => {});
          setPrintSrc(null);
          manage?.onChanged();
        }}
      />
      <ConfirmDialog open={confirmDelete} onOpenChange={setConfirmDelete} title="Hapus sesi ini?" description="Semua foto, GIF, dan hasil AI sesi ini akan dihapus permanen. Link QR tamu tidak akan berfungsi lagi." confirmLabel="Hapus permanen" onConfirm={remove} loading={busy} />
    </>
  );
}

export function PrintStatusBadge({ status }: { status: string }) {
  switch (status) {
    case 'queued':
      return <Badge tone="warn" dot>Antre</Badge>;
    case 'printing':
      return <Badge tone="brand" dot>Mencetak</Badge>;
    case 'printed':
      return <Badge tone="ok" dot>Tercetak</Badge>;
    case 'failed':
      return <Badge tone="danger" dot>Gagal</Badge>;
    case 'cancelled':
      return <Badge tone="neutral">Batal</Badge>;
    default:
      return <Badge>{status}</Badge>;
  }
}
