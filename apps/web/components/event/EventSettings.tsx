'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Camera, Globe, Image as ImageIcon, KeyRound, Printer, Save, Settings, Sparkles } from 'lucide-react';
import { PageHeader } from '@/components/shell/PortalShell';
import { Panel, PanelHeader } from '@/components/ui/panel';
import { Button } from '@/components/ui/button';
import { Field, Input, Select, Textarea } from '@/components/ui/field';
import { SwitchRow } from '@/components/ui/switch';
import { Segmented } from '@/components/ui/segmented';
import { useToast } from '@/components/ui/toast';
import { api } from '@/lib/fetcher';
import type { EventConfig, GalleryVisibility, PrintMode } from '@/lib/events';
import { FILTERS } from '@/lib/booth/media';
import { AI_STYLES, CUSTOM_STYLE_ID } from '@/lib/ai/styles';
import { PAPERS } from '@/lib/print/papers';
import { cn } from '@/lib/utils';

type Editable = Omit<EventConfig, 'id' | 'code' | 'hasPin' | 'galleryToken' | 'activePromptTemplateId' | 'createdAt'>;

const PRINT_MODES: Array<{ id: PrintMode; title: string; body: string }> = [
  { id: 'station', title: 'Print station', body: 'Masuk antrean; dicetak oleh halaman Print Station atau print worker di PC printer. Cocok untuk iPad.' },
  { id: 'browser', title: 'Langsung dari booth', body: 'Perangkat booth membuka dialog print sendiri. Cocok untuk laptop yang tersambung printer.' },
  { id: 'off', title: 'Tanpa cetak', body: 'Hanya softfile (QR).' },
];
const VISIBILITY: Array<{ id: GalleryVisibility; title: string; body: string }> = [
  { id: 'private', title: 'Privat', body: 'Tamu hanya bisa melihat sesinya sendiri (lewat QR). Galeri penuh hanya untuk pengelola.' },
  { id: 'unlisted', title: 'Dengan link', body: 'Semua tamu yang punya link galeri bisa melihat foto event ini.' },
  { id: 'public', title: 'Publik', body: 'Seperti "dengan link", plus tampil di galeri global Photovoks.' },
];

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className={cn('h-8 rounded-full border px-3 text-[13px] font-semibold transition', on ? 'border-brand bg-brand text-white' : 'border-line-strong bg-surface text-ink-2 hover:border-faint')}>
      {children}
    </button>
  );
}

function OptionCard({ on, onClick, title, body }: { on: boolean; onClick: () => void; title: string; body: string }) {
  return (
    <button type="button" onClick={onClick} className={cn('rounded-[12px] border p-3 text-left transition', on ? 'border-brand bg-brand-soft ring-1 ring-brand' : 'border-line hover:border-line-strong')}>
      <p className={cn('text-sm font-bold', on && 'text-brand-ink')}>{title}</p>
      <p className="mt-0.5 text-xs leading-relaxed text-muted">{body}</p>
    </button>
  );
}

export function EventSettings({ initial, isAdmin, aiConfigured, hasCustomPrompt }: { initial: EventConfig; isAdmin: boolean; aiConfigured: boolean; hasCustomPrompt: boolean }) {
  const toast = useToast();
  const router = useRouter();
  const [form, setForm] = useState<Editable>(() => {
    const { id, code, hasPin, galleryToken, activePromptTemplateId, createdAt, ...rest } = initial; // eslint-disable-line @typescript-eslint/no-unused-vars
    return rest;
  });
  const [baseline, setBaseline] = useState(JSON.stringify(form));
  const [saving, setSaving] = useState(false);
  const dirty = JSON.stringify(form) !== baseline;
  const set = <K extends keyof Editable>(k: K, v: Editable[K]) => setForm((f) => ({ ...f, [k]: v }));
  const toggleIn = (k: 'filters' | 'aiStyles', id: string) => set(k, form[k].includes(id) ? form[k].filter((x) => x !== id) : [...form[k], id]);

  async function save() {
    if (!form.name.trim()) return toast('Nama event wajib diisi', 'error');
    const payload = { ...form, filters: form.filters.includes('original') ? form.filters : ['original', ...form.filters] };
    setSaving(true);
    try {
      await api(`/api/events/${initial.code}`, { method: 'PATCH', json: payload });
      setForm(payload);
      setBaseline(JSON.stringify(payload));
      toast('Pengaturan disimpan');
      router.refresh();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Gagal menyimpan', 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="pb-24">
      <PageHeader title="Pengaturan" description="Berlaku untuk semua booth event ini. Booth mengambil perubahan saat kembali ke layar awal." />
      <div className="grid gap-6 xl:grid-cols-2">
        <div className="flex flex-col gap-6">
          <Panel>
            <PanelHeader icon={<Settings />} title="Umum" />
            <div className="grid gap-4 p-5">
              <Field label="Nama event"><Input value={form.name} onChange={(e) => set('name', e.target.value)} maxLength={80} /></Field>
              <Field label="Deskripsi (internal)"><Textarea value={form.description ?? ''} onChange={(e) => set('description', e.target.value)} className="min-h-16" maxLength={500} /></Field>
              <Field label="Status" hint="Draft = booth berjalan dalam mode uji. Arsip = booth tidak menerima sesi baru.">
                <Segmented value={form.status} onChange={(v) => set('status', v)} options={[{ value: 'draft', label: 'Draft' }, { value: 'active', label: 'Aktif' }, { value: 'archived', label: 'Arsip' }]} />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Judul layar sambutan" hint="Kosong = default"><Input value={form.welcomeTitle ?? ''} onChange={(e) => set('welcomeTitle', e.target.value)} maxLength={80} placeholder="Foto sekarang, cetak kemudian." /></Field>
                <Field label="Subjudul"><Input value={form.welcomeSubtitle ?? ''} onChange={(e) => set('welcomeSubtitle', e.target.value)} maxLength={160} placeholder={form.name} /></Field>
              </div>
            </div>
          </Panel>

          <Panel>
            <PanelHeader icon={<Camera />} title="Sesi foto & kamera" />
            <div className="grid gap-4 p-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Jumlah foto per sesi" hint="Jika lebih banyak dari slot frame, tamu memilih foto terbaik.">
                  <Select value={form.shotCount} onChange={(e) => set('shotCount', Number(e.target.value))}>
                    {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => <option key={n} value={n}>{n} foto</option>)}
                  </Select>
                </Field>
                <Field label="Hitung mundur">
                  <Select value={form.countdownSeconds} onChange={(e) => set('countdownSeconds', Number(e.target.value))}>
                    {[2, 3, 4, 5, 7, 10].map((n) => <option key={n} value={n}>{n} detik</option>)}
                  </Select>
                </Field>
              </div>
              <Field label="Mode pengambilan">
                <Segmented value={form.captureMode} onChange={(v) => set('captureMode', v)} options={[{ value: 'auto', label: 'Otomatis berurutan' }, { value: 'manual', label: 'Tamu tekan per foto' }]} />
              </Field>
              <div className="divide-y divide-line">
                <SwitchRow title="Boleh ulang foto" description="Tamu bisa mengulang foto tertentu di layar tinjau." checked={form.allowRetake} onChange={(v) => set('allowRetake', v)} />
                {form.allowRetake ? (
                  <div className="py-3">
                    <Field label="Maksimal ulang per sesi">
                      <Select value={form.maxRetakes} onChange={(e) => set('maxRetakes', Number(e.target.value))} className="w-40">
                        {[1, 2, 3, 5, 10].map((n) => <option key={n} value={n}>{n}×</option>)}
                      </Select>
                    </Field>
                  </div>
                ) : null}
                <SwitchRow title="Live photo & GIF" description="Merekam burst singkat di setiap jepretan untuk foto bergerak + GIF." checked={form.livePhoto} onChange={(v) => set('livePhoto', v)} />
                <SwitchRow title="Mode cermin" description="Preview & hasil seperti bercermin (lebih natural untuk selfie)." checked={form.mirrorPreview} onChange={(v) => set('mirrorPreview', v)} />
              </div>
              <Field label="Filter yang tersedia untuk tamu">
                <div className="flex flex-wrap gap-2">
                  {FILTERS.map((f) => <Chip key={f.id} on={form.filters.includes(f.id)} onClick={() => f.id !== 'original' && toggleIn('filters', f.id)}>{f.label}</Chip>)}
                </div>
              </Field>
            </div>
          </Panel>
        </div>

        <div className="flex flex-col gap-6">
          <Panel>
            <PanelHeader icon={<Printer />} title="Cetak" />
            <div className="grid gap-4 p-5">
              <div className="grid gap-2 sm:grid-cols-3">
                {PRINT_MODES.map((m) => <OptionCard key={m.id} on={form.printMode === m.id} onClick={() => set('printMode', m.id)} title={m.title} body={m.body} />)}
              </div>
              {form.printMode !== 'off' ? (
                <div className="grid gap-4 sm:grid-cols-3">
                  <Field label="Ukuran kertas">
                    <Select value={form.printPaper} onChange={(e) => set('printPaper', e.target.value)}>
                      {PAPERS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                    </Select>
                  </Field>
                  <Field label="Salinan per sesi">
                    <Select value={form.printCopies} onChange={(e) => set('printCopies', Number(e.target.value))}>
                      {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n} lembar</option>)}
                    </Select>
                  </Field>
                  <Field label="Cetak dari HP tamu" hint="Maks. lembar per sesi">
                    <Select value={form.maxGuestPrints} onChange={(e) => set('maxGuestPrints', Number(e.target.value))}>
                      {[0, 1, 2, 3, 5, 10].map((n) => <option key={n} value={n}>{n === 0 ? 'Tidak boleh' : `${n} lembar`}</option>)}
                    </Select>
                  </Field>
                </div>
              ) : null}
            </div>
          </Panel>

          <Panel id="galeri">
            <PanelHeader icon={<Globe />} title="Galeri & privasi" />
            <div className="grid gap-4 p-5">
              <div className="grid gap-2 sm:grid-cols-3">
                {VISIBILITY.map((v) => <OptionCard key={v.id} on={form.galleryVisibility === v.id} onClick={() => set('galleryVisibility', v.id)} title={v.title} body={v.body} />)}
              </div>
              <Field label="Masa simpan foto" hint="Setelah lewat, link QR tidak berlaku dan file dihapus oleh job pembersihan.">
                <Select value={form.retentionDays} onChange={(e) => set('retentionDays', Number(e.target.value))} className="w-48">
                  {[1, 3, 7, 14, 30, 60, 90, 180, 365].map((n) => <option key={n} value={n}>{n} hari</option>)}
                </Select>
              </Field>
            </div>
          </Panel>

          <Panel id="ai">
            <PanelHeader icon={<Sparkles />} title="Gaya AI" description={aiConfigured ? 'Tamu bisa mengubah foto menjadi gambar bergaya (via OpenRouter).' : 'OPENROUTER_API_KEY belum diisi di server — fitur tidak akan muncul untuk tamu.'} />
            <div className="grid gap-4 p-5">
              <SwitchRow title="Aktifkan Gaya AI" checked={form.aiEnabled} onChange={(v) => set('aiEnabled', v)} />
              {form.aiEnabled ? (
                <>
                  <Field label="Gaya yang tersedia">
                    <div className="flex flex-wrap gap-2">
                      {AI_STYLES.map((s) => <Chip key={s.id} on={form.aiStyles.includes(s.id)} onClick={() => toggleIn('aiStyles', s.id)}>{s.label}</Chip>)}
                      <Chip on={form.aiStyles.includes(CUSTOM_STYLE_ID)} onClick={() => toggleIn('aiStyles', CUSTOM_STYLE_ID)}>Gaya Event (prompt kustom)</Chip>
                    </div>
                    {form.aiStyles.includes(CUSTOM_STYLE_ID) && !hasCustomPrompt ? <p className="mt-1.5 text-xs text-warn">Belum ada prompt kustom aktif. {isAdmin ? <Link className="font-semibold underline" href={`/admin/prompts?eventId=${initial.id}`}>Buat di Prompt AI</Link> : 'Minta pemilik membuatnya.'}</p> : null}
                  </Field>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Maks. hasil AI per sesi">
                      <Select value={form.aiPerSession} onChange={(e) => set('aiPerSession', Number(e.target.value))}>
                        {[1, 2, 3, 5, 10].map((n) => <option key={n} value={n}>{n}</option>)}
                      </Select>
                    </Field>
                    <Field label="Batas harian event" hint="Melindungi biaya API">
                      <Input type="number" min={0} max={10000} value={form.dailySketchCap} onChange={(e) => set('dailySketchCap', Math.max(0, Math.min(10000, Number(e.target.value) || 0)))} />
                    </Field>
                  </div>
                </>
              ) : null}
            </div>
          </Panel>

          <Panel>
            <PanelHeader icon={<KeyRound />} title="Akses" />
            <div className="p-5 text-sm text-ink-2">
              <p>Kode event: <span className="font-mono font-bold tracking-widest">{initial.code}</span> · PIN: {initial.hasPin ? 'sudah diatur' : <b className="text-danger">belum diatur</b>}</p>
              <p className="mt-1 text-xs text-muted">{isAdmin ? <>Ganti kode / PIN di <Link href="/admin/events" className="font-semibold text-brand">Portal Pemilik › Event</Link>.</> : 'Hanya pemilik yang dapat mengganti kode dan PIN.'}</p>
            </div>
          </Panel>
        </div>
      </div>

      <div className={cn('fixed right-4 bottom-[max(16px,env(safe-area-inset-bottom))] z-20 flex items-center gap-3 rounded-[14px] border border-line bg-surface/95 px-4 py-2.5 shadow-pop backdrop-blur transition sm:right-8', dirty ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-4 opacity-0')}>
        <span className="flex items-center gap-1.5 text-sm text-muted"><ImageIcon className="size-4" /> Ada perubahan</span>
        <Button variant="ghost" size="sm" onClick={() => setForm(JSON.parse(baseline))}>Batal</Button>
        <Button variant="primary" onClick={save} loading={saving}><Save /> Simpan Pengaturan</Button>
      </div>
    </div>
  );
}
