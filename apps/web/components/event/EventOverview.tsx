'use client';

import React, { useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { QRCodeSVG } from 'qrcode.react';
import { ArrowRight, Camera, Check, Copy, ExternalLink, Frame, Printer, Settings, Sparkles, TriangleAlert } from 'lucide-react';
import { PageHeader } from '@/components/shell/PortalShell';
import { Panel, PanelHeader, Stat } from '@/components/ui/panel';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { SessionGrid, SessionLightbox } from '@/components/gallery/SessionGallery';
import type { EventConfig } from '@/lib/events';
import type { SessionSummary } from '@/lib/session-types';
import { useEventSessions } from './useEventSessions';

const noopSubscribe = () => () => {};

export function EventOverview({ event, isAdmin, frameCount, aiConfigured, printWorkerOnline }: { event: EventConfig; isAdmin: boolean; frameCount: number; aiConfigured: boolean; printWorkerOnline: boolean }) {
  const toast = useToast();
  const { sessions, stats, reload } = useEventSessions(event.code, 'today', '', 12);
  const [open, setOpen] = useState<SessionSummary | null>(null);
  const origin = useSyncExternalStore(noopSubscribe, () => window.location.origin, () => '');
  const boothUrl = `${origin}/booth/${event.code}`;
  const galleryUrl = `${origin}/g/${event.galleryToken}`;

  const checks: Array<{ ok: boolean; label: string; href?: string; warn?: boolean }> = [
    { ok: event.hasPin, label: event.hasPin ? 'PIN event sudah diatur' : 'PIN event belum diatur (atur di Event › Edit)', href: isAdmin ? '/admin/events' : undefined },
    { ok: frameCount > 0, label: frameCount > 0 ? `${frameCount} frame aktif` : 'Belum ada frame aktif', href: `/event/${event.code}/frames` },
    { ok: event.status === 'active', label: event.status === 'active' ? 'Event aktif' : 'Event masih draft — booth berjalan dalam mode uji', href: `/event/${event.code}/settings`, warn: true },
    ...(event.aiEnabled ? [{ ok: aiConfigured, label: aiConfigured ? 'AI (OpenRouter) siap' : 'AI aktif tapi OPENROUTER_API_KEY belum diisi', warn: true }] : []),
    ...(event.printMode === 'station' ? [{ ok: printWorkerOnline, label: printWorkerOnline ? 'Print worker online' : 'Print worker offline — gunakan halaman Print Station atau jalankan `pnpm print`', href: `/event/${event.code}/print`, warn: true }] : []),
  ];

  function copy(text: string) {
    navigator.clipboard.writeText(text).then(() => toast('Disalin'), () => toast('Gagal menyalin', 'error'));
  }

  return (
    <div>
      <PageHeader
        title={event.name}
        description={event.description || 'Ringkasan hari ini, status booth, dan link penting.'}
        actions={
          <>
            <Link href={`/event/${event.code}/settings`}><Button variant="secondary"><Settings /> Pengaturan</Button></Link>
            <a href={`/booth/${event.code}`} target="_blank" rel="noreferrer"><Button variant="primary"><Camera /> Buka Booth</Button></a>
          </>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Sesi hari ini" value={stats?.sessions ?? '–'} unit="sesi" />
        <Stat label="Lembar dicetak" value={stats?.prints ?? '–'} unit="lembar" />
        <Stat label="Hasil AI" value={stats?.ai ?? '–'} unit="gambar" />
        <Stat label="Status" value={<Badge tone={event.status === 'active' ? 'ok' : event.status === 'draft' ? 'warn' : 'neutral'} dot>{event.status === 'active' ? 'Aktif' : event.status === 'draft' ? 'Draft' : 'Arsip'}</Badge>} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <Panel>
          <PanelHeader
            title="Sesi terbaru"
            description="Hari ini"
            actions={<Link href={`/event/${event.code}/gallery`} className="flex items-center gap-1 text-sm font-semibold text-brand">Galeri <ArrowRight className="size-4" /></Link>}
          />
          <div className="p-4">
            {sessions.length ? (
              <SessionGrid sessions={sessions} onOpen={setOpen} dense />
            ) : (
              <p className="py-10 text-center text-sm text-muted">Belum ada sesi hari ini. Buka booth untuk mulai.</p>
            )}
          </div>
        </Panel>

        <div className="flex flex-col gap-6">
          <Panel>
            <PanelHeader title="Kesiapan booth" />
            <ul className="flex flex-col gap-1 p-3">
              {checks.map((c) => {
                const body = (
                  <span className="flex items-start gap-2.5 rounded-[10px] px-2 py-2 text-sm">
                    {c.ok ? <Check className="mt-0.5 size-4 shrink-0 text-ok" /> : <TriangleAlert className={c.warn ? 'mt-0.5 size-4 shrink-0 text-warn' : 'mt-0.5 size-4 shrink-0 text-danger'} />}
                    <span className={c.ok ? 'text-ink-2' : 'font-semibold'}>{c.label}</span>
                  </span>
                );
                return <li key={c.label}>{c.href && !c.ok ? <Link href={c.href} className="block rounded-[10px] hover:bg-canvas">{body}</Link> : body}</li>;
              })}
            </ul>
          </Panel>

          <Panel>
            <PanelHeader title="Link booth" description="Buka di iPad / laptop booth, lalu masukkan PIN event." />
            <div className="flex items-center gap-4 p-4">
              <div className="shrink-0 rounded-[10px] border border-line p-1.5">{origin ? <QRCodeSVG value={boothUrl} size={92} marginSize={0} /> : <span className="block size-[92px]" />}</div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-mono text-xs text-muted">{boothUrl}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button size="sm" variant="secondary" onClick={() => copy(boothUrl)}><Copy /> Salin</Button>
                  <Link href={`/event/${event.code}/print`}><Button size="sm" variant="secondary"><Printer /> Print station</Button></Link>
                </div>
              </div>
            </div>
          </Panel>

          <Panel>
            <PanelHeader title="Galeri bersama" description={event.galleryVisibility === 'private' ? 'Privat — hanya pengelola event yang bisa melihat semua foto.' : event.galleryVisibility === 'unlisted' ? 'Siapa pun dengan link bisa melihat galeri event.' : 'Publik — juga tampil di galeri global.'} />
            <div className="flex flex-wrap items-center gap-2 p-4">
              {event.galleryVisibility === 'private' ? (
                <Link href={`/event/${event.code}/settings#galeri`}><Button size="sm" variant="secondary"><Settings /> Ubah visibilitas</Button></Link>
              ) : (
                <>
                  <Button size="sm" variant="secondary" onClick={() => copy(galleryUrl)}><Copy /> Salin link galeri</Button>
                  <a href={galleryUrl} target="_blank" rel="noreferrer"><Button size="sm" variant="ghost"><ExternalLink /> Buka</Button></a>
                </>
              )}
            </div>
          </Panel>

          <div className="grid grid-cols-2 gap-3">
            <Link href={`/event/${event.code}/frames`} className="flex items-center gap-2 rounded-panel border border-line bg-surface px-4 py-3 text-sm font-semibold shadow-panel hover:border-line-strong"><Frame className="size-4 text-muted" /> Atur frame</Link>
            <Link href={`/event/${event.code}/settings#ai`} className="flex items-center gap-2 rounded-panel border border-line bg-surface px-4 py-3 text-sm font-semibold shadow-panel hover:border-line-strong"><Sparkles className="size-4 text-muted" /> Gaya AI</Link>
          </div>
        </div>
      </div>

      <SessionLightbox session={open} onClose={() => setOpen(null)} manage={{ code: event.code, onChanged: reload }} printPaper={event.printPaper} />
    </div>
  );
}
