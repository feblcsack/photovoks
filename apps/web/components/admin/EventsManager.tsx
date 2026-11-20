'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { CalendarDays, Camera, ChevronDown, Copy, KeyRound, Laptop, LayoutGrid, Pencil, Plus, Tablet, Trash2 } from 'lucide-react';
import { PageHeader } from '@/components/shell/PortalShell';
import { Panel } from '@/components/ui/panel';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ConfirmDialog, Dialog } from '@/components/ui/dialog';
import { Field, Input } from '@/components/ui/field';
import { Segmented } from '@/components/ui/segmented';
import { EmptyState } from '@/components/ui/empty-state';
import { useToast } from '@/components/ui/toast';
import { api } from '@/lib/fetcher';
import type { EventConfig, EventStatus } from '@/lib/events';
import { cn } from '@/lib/utils';

const STATUS: Record<EventStatus, { label: string; tone: 'ok' | 'warn' | 'neutral' }> = {
  active: { label: 'Aktif', tone: 'ok' },
  draft: { label: 'Draft', tone: 'warn' },
  archived: { label: 'Arsip', tone: 'neutral' },
};

export function EventsManager({ initial, sessionCounts }: { initial: EventConfig[]; sessionCounts: Record<string, number> }) {
  const router = useRouter();
  const params = useSearchParams();
  const toast = useToast();
  const events = initial;
  const [createOpen, setCreateOpen] = useState(params.get('new') === '1');
  const [edit, setEdit] = useState<EventConfig | null>(null);
  const [del, setDel] = useState<EventConfig | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [help, setHelp] = useState<string | null>(null);

  function copy(text: string) {
    navigator.clipboard.writeText(text).then(() => toast('Disalin'));
  }

  async function remove() {
    if (!del) return;
    setDeleting(true);
    try {
      await api(`/api/admin/events/${del.id}`, { method: 'DELETE' });
      toast('Event dihapus');
      setDel(null);
      router.refresh();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Gagal menghapus', 'error');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div>
      <PageHeader title="Event" description="Setiap event punya kode, PIN, frame, galeri, dan pengaturan booth sendiri." actions={<Button variant="primary" onClick={() => setCreateOpen(true)}><Plus /> Tambah Event</Button>} />

      <Panel className="mb-6">
        <div className="px-5 pt-4 pb-1 text-sm font-bold">Cara menjalankan booth</div>
        {[
          { id: 'ipad', icon: Tablet, title: 'iPad / tablet (Safari, Chrome)', sub: 'Buka /booth/KODE · masukkan PIN event', body: 'Buka link booth lewat HTTPS → masukkan PIN event sekali → Share › Add to Home Screen agar layar penuh → aktifkan Guided Access (Pengaturan › Aksesibilitas) supaya tamu tidak keluar. Cetak lewat mode "Print station": buka /event/KODE/print di laptop yang tersambung printer.' },
          { id: 'laptop', icon: Laptop, title: 'Laptop / PC + webcam', sub: 'Chrome layar penuh · bisa cetak langsung', body: 'Buka /booth/KODE di Chrome → PIN → tahan ikon ⚙ di pojok untuk memilih webcam & layar penuh. Untuk cetak langsung dari booth pilih mode cetak "Langsung dari booth". Untuk cetak tanpa dialog jalankan Chrome dengan flag --kiosk-printing (lihat README).' },
        ].map((h) => (
          <div key={h.id} className="border-t border-line first-of-type:border-t-0">
            <button type="button" onClick={() => setHelp(help === h.id ? null : h.id)} className="flex w-full items-center gap-3 px-5 py-3 text-left hover:bg-canvas/60">
              <h.icon className="size-4 text-muted" />
              <span className="flex-1"><span className="block text-sm font-semibold">{h.title}</span><span className="text-xs text-muted">{h.sub}</span></span>
              <ChevronDown className={cn('size-4 text-muted transition', help === h.id && 'rotate-180')} />
            </button>
            {help === h.id ? <p className="px-5 pb-4 pl-12 text-sm leading-relaxed text-ink-2">{h.body}</p> : null}
          </div>
        ))}
      </Panel>

      {!events.length ? (
        <Panel><EmptyState icon={<CalendarDays />} title="Belum ada event" description="Buat event pertama untuk mendapatkan kode booth dan PIN." action={<Button variant="primary" onClick={() => setCreateOpen(true)}><Plus /> Tambah Event</Button>} /></Panel>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {events.map((e) => (
            <Panel key={e.id} className="flex flex-col p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-3">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-[10px] bg-brand-soft text-brand"><CalendarDays className="size-5" /></span>
                  <div className="min-w-0">
                    <p className="truncate text-[15px] font-bold">{e.name}</p>
                    <p className="text-xs text-muted">{sessionCounts[e.id] ?? 0} sesi · cetak: {e.printMode === 'off' ? 'tidak' : e.printMode === 'browser' ? 'langsung' : 'print station'}</p>
                  </div>
                </div>
                <Badge tone={STATUS[e.status].tone} dot>{STATUS[e.status].label}</Badge>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-[12px] border border-line bg-line">
                <div className="bg-surface px-3 py-2.5">
                  <p className="text-[10px] font-bold tracking-wider text-muted uppercase">Kode event</p>
                  <div className="mt-0.5 flex items-center justify-between">
                    <span className="font-mono text-base font-bold tracking-[0.2em]">{e.code}</span>
                    <button type="button" onClick={() => copy(e.code)} className="flex size-7 items-center justify-center rounded-[7px] text-muted hover:bg-ink/5" aria-label="Salin kode"><Copy className="size-3.5" /></button>
                  </div>
                </div>
                <div className="bg-surface px-3 py-2.5">
                  <p className="text-[10px] font-bold tracking-wider text-muted uppercase">PIN</p>
                  <div className="mt-0.5 flex items-center justify-between">
                    <span className={cn('text-base font-bold tracking-[0.3em]', !e.hasPin && 'text-sm tracking-normal text-danger')}>{e.hasPin ? '••••' : 'Belum ada'}</span>
                    <button type="button" onClick={() => setEdit(e)} className="flex size-7 items-center justify-center rounded-[7px] text-muted hover:bg-ink/5" aria-label="Ubah PIN"><KeyRound className="size-3.5" /></button>
                  </div>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <a href={`/booth/${e.code}`} target="_blank" rel="noreferrer"><Button variant="primary" className="w-full"><Camera /> Buka Booth</Button></a>
                <Link href={`/event/${e.code}`}><Button variant="secondary" className="w-full"><LayoutGrid /> Kelola</Button></Link>
              </div>
              <div className="mt-2 flex justify-center gap-1">
                <Button variant="ghost" size="sm" onClick={() => setEdit(e)}><Pencil /> Kode & PIN</Button>
                <Button variant="danger-ghost" size="sm" onClick={() => setDel(e)}><Trash2 /> Hapus</Button>
              </div>
            </Panel>
          ))}
        </div>
      )}

      <CreateEventDialog open={createOpen} onOpenChange={setCreateOpen} onCreated={(ev) => { setCreateOpen(false); toast(`Event dibuat · kode ${ev.code}`); router.push(`/event/${ev.code}`); }} />
      <EditEventDialog key={edit?.id ?? 'none'} event={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); router.refresh(); }} />
      <ConfirmDialog
        open={!!del}
        onOpenChange={(o) => !o && setDel(null)}
        title={`Hapus "${del?.name}"?`}
        description={<>Semua sesi ({del ? sessionCounts[del.id] ?? 0 : 0}), foto, dan hasil AI event ini akan dihapus permanen. Frame di library tidak ikut terhapus.</>}
        confirmLabel="Hapus event"
        onConfirm={remove}
        loading={deleting}
      />
    </div>
  );
}

function CreateEventDialog({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (o: boolean) => void; onCreated: (e: EventConfig) => void }) {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ event: EventConfig }>('/api/admin/events', { method: 'POST', json: { name, code: code || undefined, pin } });
      setName('');
      setCode('');
      setPin('');
      onCreated(res.event);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal membuat event');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange} size="sm" title="Event baru" description="Kode + PIN dipakai operator untuk membuka booth.">
      <form id="create-event" onSubmit={submit} className="flex flex-col gap-4">
        <Field label="Nama event" htmlFor="ev-name"><Input id="ev-name" required value={name} onChange={(e) => setName(e.target.value)} placeholder="Wedding Andi & Sari" autoFocus maxLength={80} /></Field>
        <Field label="Kode event (opsional)" hint="4–12 huruf/angka. Kosongkan untuk kode acak." htmlFor="ev-code"><Input id="ev-code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} placeholder="Otomatis" maxLength={12} className="font-mono tracking-widest" /></Field>
        <Field label="PIN event" hint="4–8 angka. Simpan baik-baik — PIN hanya disimpan sebagai hash." htmlFor="ev-pin"><Input id="ev-pin" required inputMode="numeric" pattern="\d{4,8}" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 8))} placeholder="••••" className="font-mono tracking-[0.3em]" /></Field>
        {error ? <p className="text-sm text-danger">{error}</p> : null}
        <Button type="submit" variant="primary" loading={busy} disabled={!name.trim() || pin.length < 4}>Buat event</Button>
      </form>
    </Dialog>
  );
}

function EditEventDialog({ event, onClose, onSaved }: { event: EventConfig | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  // Remounted per event (key), so initial state comes straight from props.
  const [name, setName] = useState(event?.name ?? '');
  const [code, setCode] = useState(event?.code ?? '');
  const [pin, setPin] = useState('');
  const [status, setStatus] = useState<EventStatus>(event?.status ?? 'draft');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    if (!event) return;
    setBusy(true);
    setError(null);
    try {
      const body: Record<string, unknown> = { name, status };
      if (code !== event.code) body.code = code;
      if (pin) body.pin = pin;
      await api(`/api/admin/events/${event.id}`, { method: 'PATCH', json: body });
      toast(pin ? 'Disimpan · perangkat booth perlu memasukkan PIN baru' : 'Disimpan');
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal menyimpan');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={!!event} onOpenChange={(o) => !o && onClose()} size="sm" title="Kode, PIN & status">
      <form onSubmit={submit} className="flex flex-col gap-4">
        <Field label="Nama event"><Input required value={name} onChange={(e) => setName(e.target.value)} maxLength={80} /></Field>
        <Field label="Kode event" hint="Mengganti kode membuat link booth & QR lama tidak berlaku."><Input value={code} onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} maxLength={12} className="font-mono tracking-widest" /></Field>
        <Field label={event?.hasPin ? 'PIN baru' : 'Atur PIN'} hint={event?.hasPin ? 'Kosongkan jika tidak diganti. Semua perangkat yang login akan keluar.' : 'Wajib agar booth bisa dibuka.'}>
          <Input inputMode="numeric" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 8))} placeholder="••••" className="font-mono tracking-[0.3em]" />
        </Field>
        <Field label="Status"><Segmented value={status} onChange={setStatus} options={[{ value: 'draft', label: 'Draft' }, { value: 'active', label: 'Aktif' }, { value: 'archived', label: 'Arsip' }]} /></Field>
        {error ? <p className="text-sm text-danger">{error}</p> : null}
        <Button type="submit" variant="primary" loading={busy} disabled={!name.trim() || code.length < 4 || (pin.length > 0 && pin.length < 4)}>Simpan</Button>
      </form>
    </Dialog>
  );
}
