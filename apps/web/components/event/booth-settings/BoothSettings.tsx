'use client';

import React, { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { QRCodeSVG } from 'qrcode.react';
import { Copy, ExternalLink, Monitor, Trash2, Upload } from 'lucide-react';
import { PageHeader } from '@/components/shell/PortalShell';
import { Button } from '@/components/ui/button';
import { Field, Input, Select, Textarea } from '@/components/ui/field';
import { SwitchRow } from '@/components/ui/switch';
import { Segmented } from '@/components/ui/segmented';
import { Spinner } from '@/components/ui/spinner';
import { useToast } from '@/components/ui/toast';
import { api } from '@/lib/fetcher';
import type { EventConfig, GalleryVisibility, PaymentMode, PrintMode } from '@/lib/events';
import { formatRupiah } from '@/lib/settings-shared';
import type { FrameRecord, QrPlacement } from '@/lib/frames/types';
import { FILTERS } from '@/lib/booth/media';
import { LIVE_THEMES } from '@/lib/events';
import { AI_STYLES, CUSTOM_STYLE_ID } from '@/lib/ai/styles';
import { PAPERS } from '@/lib/print/papers';
import { cn } from '@/lib/utils';
import { FramesSection, type FramesState } from './FramesSection';
import { FileButton, HomeScreenSection, uploadEventMedia } from './HomeScreenSection';
import { variant } from '@/lib/media-variant';

type Editable = Omit<EventConfig, 'id' | 'code' | 'hasPin' | 'galleryToken' | 'publicToken' | 'activePromptTemplateId' | 'createdAt'>;

const SECTIONS = [
  { id: 'layar-awal', label: 'Layar awal' },
  { id: 'frame', label: 'Frame & QR' },
  { id: 'sesi', label: 'Sesi foto' },
  { id: 'cetak', label: 'Cetak' },
  { id: 'bayar', label: 'Pembayaran' },
  { id: 'tamu', label: 'Fitur tamu' },
  { id: 'galeri', label: 'Galeri, live & buku tamu' },
  { id: 'akses', label: 'Status & akses' },
] as const;

const PRINT_MODES: Array<{ id: PrintMode; title: string; body: string }> = [
  { id: 'browser', title: 'Langsung dari booth', body: 'Tamu tekan Cetak → langsung ke printer yang tersambung ke perangkat booth.' },
  { id: 'station', title: 'Antrean print station', body: 'Masuk antrean; dicetak di halaman Print Station / print worker. Cocok untuk iPad.' },
  { id: 'off', title: 'Tanpa cetak', body: 'Hanya softfile lewat QR.' },
];
const PAYMENT_MODES_UI: Array<{ id: PaymentMode; title: string; body: string }> = [
  { id: 'off', title: 'Gratis', body: 'Tanpa pembayaran — sesi & AI gratis.' },
  { id: 'both', title: 'QRIS + kasir', body: 'Tamu pilih: QRIS otomatis atau bayar tunai ke operator.' },
  { id: 'qris', title: 'QRIS saja', body: 'Dicek otomatis lewat DOKU / Aulaa.' },
  { id: 'cash', title: 'Kasir / admin saja', body: 'Operator menyetujui di menu Pembayaran.' },
];

const VISIBILITY: Array<{ id: GalleryVisibility; title: string; body: string }> = [
  { id: 'private', title: 'Privat', body: 'Tamu hanya melihat sesinya sendiri (QR).' },
  { id: 'unlisted', title: 'Dengan link', body: 'Siapa pun yang punya link galeri bisa melihat.' },
  { id: 'public', title: 'Publik', body: 'Dengan link + tampil di galeri global.' },
];

const noopSubscribe = () => () => {};

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={on} className={cn('h-8 rounded-full border px-3 text-[13px] font-semibold transition', on ? 'border-ink bg-ink text-white' : 'border-line-strong bg-surface text-ink-2 hover:border-faint')}>
      {children}
    </button>
  );
}

function OptionCard({ on, onClick, title, body }: { on: boolean; onClick: () => void; title: string; body: string }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={on} className={cn('rounded-[12px] border p-3 text-left transition', on ? 'border-brand bg-brand-soft ring-1 ring-brand' : 'border-line hover:border-line-strong')}>
      <p className={cn('text-sm font-bold', on && 'text-brand-ink')}>{title}</p>
      <p className="mt-0.5 text-xs leading-relaxed text-muted">{body}</p>
    </button>
  );
}

function Section({ id, title, description, children }: { id: string; title: string; description?: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24 rounded-panel border border-line bg-surface shadow-panel">
      <header className="border-b border-line px-5 py-4">
        <h2 className="text-[15px] font-bold text-ink">{title}</h2>
        {description ? <p className="mt-0.5 text-[13px] text-muted">{description}</p> : null}
      </header>
      <div className="p-5">{children}</div>
    </section>
  );
}

function LinkRow({ label, url, onCopy }: { label: string; url: string; onCopy: (u: string) => void }) {
  return (
    <div className="flex items-center gap-3 rounded-[12px] border border-line p-3">
      <div className="rounded-[8px] bg-white p-1 ring-1 ring-line"><QRCodeSVG value={url || ' '} size={64} marginSize={0} /></div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">{label}</p>
        <p className="truncate font-mono text-[11px] text-muted">{url}</p>
        <div className="mt-1.5 flex gap-1.5">
          <Button size="xs" variant="secondary" onClick={() => onCopy(url)}><Copy /> Salin</Button>
          <a href={url} target="_blank" rel="noreferrer"><Button size="xs" variant="secondary"><ExternalLink /> Buka</Button></a>
        </div>
      </div>
    </div>
  );
}

export function BoothSettings({
  initial,
  isAdmin,
  aiConfigured,
  hasCustomPrompt,
  attractUrl,
  stickerUrls,
  paymentInfo = { qrisConfigured: false, globalEnabled: true },
}: {
  initial: EventConfig;
  isAdmin: boolean;
  aiConfigured: boolean;
  hasCustomPrompt: boolean;
  attractUrl: string | null;
  stickerUrls: Record<string, string>;
  paymentInfo?: { qrisConfigured: boolean; globalEnabled: boolean };
}) {
  const toast = useToast();
  const router = useRouter();
  const origin = useSyncExternalStore(noopSubscribe, () => window.location.origin, () => '');
  const code = initial.code;

  // ── Event settings ──────────────────────────────────────────────────────
  const [form, setForm] = useState<Editable>(() => {
    const { id, code: _c, hasPin, galleryToken, publicToken, activePromptTemplateId, createdAt, ...rest } = initial; // eslint-disable-line @typescript-eslint/no-unused-vars
    return rest;
  });
  const [baseline, setBaseline] = useState(() => JSON.stringify(form));
  const set = useCallback(<K extends keyof Editable>(k: K, v: Editable[K]) => setForm((f) => ({ ...f, [k]: v })), []);
  const toggleIn = (k: 'filters' | 'aiStyles', id: string) => set(k, form[k].includes(id) ? form[k].filter((x) => x !== id) : [...form[k], id]);

  // ── Frames ──────────────────────────────────────────────────────────────
  const [library, setLibrary] = useState<FrameRecord[]>([]);
  const [framesLoading, setFramesLoading] = useState(true);
  const [frames, setFrames] = useState<FramesState>({ selected: [], qr: {} });
  const [framesBaseline, setFramesBaseline] = useState('');

  const loadFrames = useCallback(async () => {
    setFramesLoading(true);
    try {
      const res = await api<{ assigned: FrameRecord[]; library: FrameRecord[] }>(`/api/events/${code}/frames`);
      setLibrary(res.library);
      const state: FramesState = {
        selected: res.assigned.map((f) => f.id),
        qr: Object.fromEntries(res.assigned.map((f) => [f.id, f.qrPlacement ?? null])) as Record<string, QrPlacement>,
      };
      setFrames(state);
      setFramesBaseline(JSON.stringify(state));
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Gagal memuat frame', 'error');
    } finally {
      setFramesLoading(false);
    }
  }, [code, toast]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data fetch
    void loadFrames();
  }, [loadFrames]);

  const eventDirty = JSON.stringify(form) !== baseline;
  const framesDirty = !framesLoading && JSON.stringify(frames) !== framesBaseline;
  const dirty = eventDirty || framesDirty;
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [dirty]);

  async function save() {
    if (!form.name.trim()) return toast('Nama event wajib diisi', 'error');
    setSaving(true);
    try {
      if (eventDirty) {
        const payload = { ...form, filters: form.filters.includes('original') ? form.filters : ['original', ...form.filters] };
        await api(`/api/events/${code}`, { method: 'PATCH', json: payload });
        setForm(payload);
        setBaseline(JSON.stringify(payload));
      }
      if (framesDirty) {
        const qr = Object.fromEntries(frames.selected.map((id) => [id, frames.qr[id] ?? null]));
        await api(`/api/events/${code}/frames`, { method: 'PUT', json: { frameIds: frames.selected, qr } });
        setFramesBaseline(JSON.stringify(frames));
      }
      toast('Tersimpan. Booth memakai pengaturan baru saat kembali ke layar awal.');
      router.refresh();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Gagal menyimpan', 'error');
    } finally {
      setSaving(false);
    }
  }

  function discard() {
    setForm(JSON.parse(baseline));
    if (framesBaseline) setFrames(JSON.parse(framesBaseline));
  }

  const copy = (text: string) => navigator.clipboard.writeText(text).then(() => toast('Link disalin'), () => toast('Gagal menyalin', 'error'));
  const activeFrames = useMemo(() => frames.selected.map((id) => library.find((f) => f.id === id)).filter((f): f is FrameRecord => !!f && f.isActive), [frames.selected, library]);

  // ── Stickers ────────────────────────────────────────────────────────────
  const [stickerUploading, setStickerUploading] = useState(0);
  const [localStickers, setLocalStickers] = useState<Record<string, string>>({});
  async function addSticker(file: File) {
    if (!['image/png', 'image/webp'].includes(file.type)) return toast('Stiker harus PNG/WebP transparan', 'error');
    if (file.size > 5 * 1024 * 1024) return toast('Stiker maksimal 5 MB', 'error');
    setStickerUploading((n) => n + 1);
    try {
      const path = await uploadEventMedia(code, 'stickers', file);
      setLocalStickers((m) => ({ ...m, [path]: URL.createObjectURL(file) }));
      setForm((f) => ({ ...f, stickerPaths: [...f.stickerPaths, path].slice(0, 40) }));
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Upload gagal', 'error');
    } finally {
      setStickerUploading((n) => n - 1);
    }
  }

  const liveUrl = `${origin}/live/${initial.publicToken}`;
  const bookUrl = `${origin}/m/${initial.publicToken}`;
  const galleryUrl = `${origin}/g/${initial.galleryToken}`;

  return (
    <div className="pb-28">
      <PageHeader
        title="Pengaturan Booth"
        description="Semua pengaturan booth event ini ada di sini. Satu tombol Simpan untuk semuanya."
        actions={
          <a href={`/booth/${code}`} target="_blank" rel="noreferrer"><Button variant="secondary"><Monitor /> Buka booth</Button></a>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[180px_minmax(0,1fr)]">
        <nav aria-label="Bagian pengaturan" className="hidden lg:block">
          <ul className="sticky top-20 flex flex-col gap-0.5">
            {SECTIONS.map((s) => (
              <li key={s.id}>
                <a href={`#${s.id}`} className="block rounded-[8px] px-3 py-2 text-[13px] font-semibold text-ink-2 hover:bg-ink/5 hover:text-ink">{s.label}</a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="flex min-w-0 flex-col gap-6">
          <Section id="layar-awal" title="Layar awal" description="Yang dilihat tamu sebelum mulai. Pakai video atau gambar sendiri.">
            <HomeScreenSection
              form={{ ...form, code }}
              set={(k, v) => set(k as keyof Editable, v as never)}
              mediaUrl={form.attractMediaPath === initial.attractMediaPath ? attractUrl : null}
              frames={activeFrames}
            />
          </Section>

          <Section id="frame" title="Frame & QR" description="Frame yang bisa dipilih tamu (urutan = urutan di booth), dan letak QR softfile di hasil cetak.">
            <FramesSection code={code} library={library} loading={framesLoading} value={frames} onChange={setFrames} isAdmin={isAdmin} />
          </Section>

          <Section id="sesi" title="Sesi foto">
            <div className="grid gap-4">
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
              <Field label="Antar foto" hint={form.captureMode === 'manual' ? 'Setelah tiap foto, booth menunggu tamu menekan tombol lagi — ada waktu bersiap untuk pose berikutnya.' : 'Semua foto diambil berurutan tanpa jeda tombol.'}>
                <Segmented value={form.captureMode} onChange={(v) => set('captureMode', v)} options={[{ value: 'manual', label: 'Tamu tekan tiap foto' }, { value: 'auto', label: 'Otomatis berurutan' }]} />
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
                <SwitchRow title="Live photo & GIF" description="Merekam burst singkat di tiap jepretan untuk foto bergerak + GIF." checked={form.livePhoto} onChange={(v) => set('livePhoto', v)} />
                <SwitchRow title="Mode cermin" description="Preview & hasil seperti bercermin (lebih natural untuk selfie)." checked={form.mirrorPreview} onChange={(v) => set('mirrorPreview', v)} />
              </div>
              <Field label="Filter untuk tamu">
                <div className="flex flex-wrap gap-2">
                  {FILTERS.filter((f) => !f.family).map((f) => <Chip key={f.id} on={form.filters.includes(f.id)} onClick={() => f.id !== 'original' && toggleIn('filters', f.id)}>{f.id === 'vintage' ? 'Vintage + Booth Sepia, Noir, Film 90an, Sekali Pakai' : f.label}</Chip>)}
                </div>
              </Field>
            </div>
          </Section>

          <Section id="cetak" title="Cetak">
            <div className="grid gap-4">
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
                  <Field label="Lembar per cetak">
                    <Select value={form.printCopies} onChange={(e) => set('printCopies', Number(e.target.value))}>
                      {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n} lembar</option>)}
                    </Select>
                  </Field>
                  <Field label="Cetak dari HP tamu" hint="Termasuk hasil stiker & AI">
                    <Select value={form.maxGuestPrints} onChange={(e) => set('maxGuestPrints', Number(e.target.value))}>
                      {[0, 1, 2, 3, 5, 10].map((n) => <option key={n} value={n}>{n === 0 ? 'Tidak boleh' : `Maks. ${n} lembar`}</option>)}
                    </Select>
                  </Field>
                </div>
              ) : null}
              {form.printMode === 'browser' ? (
                <p className="text-xs leading-relaxed text-muted">Agar benar-benar tanpa dialog print, jalankan Chrome di perangkat booth dengan <code className="rounded bg-ink/5 px-1">--kiosk-printing</code>. Safari/iPad selalu menampilkan dialog print sistem.</p>
              ) : null}
              {form.printMode !== 'off' && form.maxGuestPrints > 0 ? (
                <p className="text-xs leading-relaxed text-muted">Cetakan yang diminta tamu dari HP (termasuk foto berstiker) masuk ke <Link className="font-semibold text-brand" href={`/event/${code}/print`}>Print Station</Link> untuk Anda eksekusi.</p>
              ) : null}
            </div>
          </Section>

          <Section id="bayar" title="Pembayaran" description="Tarif per sesi foto & per gambar AI. Tamu membayar sebelum mulai (QRIS) atau ke operator (tunai).">
            <div className="grid gap-4">
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                {PAYMENT_MODES_UI.map((m) => <OptionCard key={m.id} on={form.paymentMode === m.id} onClick={() => set('paymentMode', m.id)} title={m.title} body={m.body} />)}
              </div>
              {form.paymentMode !== 'off' ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Harga per sesi foto" hint={form.sessionPrice ? formatRupiah(form.sessionPrice) : 'Rp 0 = sesi gratis'}>
                    <Input type="number" inputMode="numeric" min={0} step={500} value={form.sessionPrice} onChange={(e) => set('sessionPrice', Math.max(0, Math.round(Number(e.target.value) || 0)))} />
                  </Field>
                  <Field label="Harga per gambar AI" hint={form.aiPrice ? formatRupiah(form.aiPrice) : 'Rp 0 = AI gratis'}>
                    <Input type="number" inputMode="numeric" min={0} step={500} value={form.aiPrice} onChange={(e) => set('aiPrice', Math.max(0, Math.round(Number(e.target.value) || 0)))} />
                  </Field>
                </div>
              ) : null}
              {form.paymentMode !== 'off' && ((form.sessionPrice > 0 && form.sessionPrice < 1000) || (form.aiPrice > 0 && form.aiPrice < 1000)) ? (
                <p className="text-xs font-semibold text-danger">Minimal Rp 1.000 per transaksi (batas QRIS), atau 0 untuk gratis.</p>
              ) : null}
              {form.paymentMode !== 'off' && (form.paymentMode === 'qris' || form.paymentMode === 'both') && !paymentInfo.qrisConfigured ? (
                <p className="rounded-[10px] bg-warn-soft px-3 py-2 text-xs leading-relaxed text-warn">QRIS belum aktif (DOKU / Aulaa belum diatur) — sementara tamu diarahkan ke kasir. Atur di <b>Portal Pemilik › Developer</b>.</p>
              ) : null}
              {!paymentInfo.globalEnabled ? (
                <p className="rounded-[10px] bg-warn-soft px-3 py-2 text-xs leading-relaxed text-warn">Pembayaran sedang dimatikan secara global oleh pemilik — semua sesi & AI gratis sampai diaktifkan lagi.</p>
              ) : null}
              {form.paymentMode !== 'off' ? (
                <p className="text-xs leading-relaxed text-muted">Pembayaran tunai muncul di <Link className="font-semibold text-brand" href={`/event/${code}/payments`}>Pembayaran</Link> untuk disetujui / ditolak. Operator juga bisa menggratiskan satu sesi dari menu operator booth (tahan ⚙).</p>
              ) : null}
            </div>
          </Section>

          <Section id="tamu" title="Fitur tamu" description="Yang bisa dilakukan tamu di HP setelah scan QR.">
            <div className="grid gap-5">
              <div>
                <SwitchRow title="Stiker" description="Tamu menghias fotonya dengan stiker & teks, lalu menyimpan atau mengirimnya ke printer Anda." checked={form.stickersEnabled} onChange={(v) => set('stickersEnabled', v)} />
                {form.stickersEnabled ? (
                  <div className="mt-2 rounded-[12px] border border-line p-3">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <p className="text-[13px] font-semibold text-ink-2">Stiker event <span className="font-normal text-muted">· tampil di samping stiker bawaan</span></p>
                      <FileButton accept="image/png,image/webp" multiple onFile={(f) => void addSticker(f)} disabled={stickerUploading > 0}>
                        {stickerUploading ? <Spinner className="size-4" /> : <Upload className="size-4" />} Upload PNG
                      </FileButton>
                    </div>
                    {form.stickerPaths.length ? (
                      <ul className="grid grid-cols-5 gap-2 sm:grid-cols-8">
                        {form.stickerPaths.map((p) => {
                          const url = localStickers[p] ?? stickerUrls[p];
                          return (
                            <li key={p} className="group relative flex aspect-square items-center justify-center rounded-[8px] bg-canvas p-1.5 [background-image:repeating-conic-gradient(#eceef3_0_25%,transparent_0_50%)] [background-size:12px_12px]">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              {url ? <img src={variant(url, { w: 160 })} alt="" className="max-h-full max-w-full object-contain" /> : null}
                              <button type="button" onClick={() => set('stickerPaths', form.stickerPaths.filter((x) => x !== p))} className="absolute -top-1.5 -right-1.5 hidden size-6 items-center justify-center rounded-full bg-ink text-white group-hover:flex" aria-label="Hapus stiker"><Trash2 className="size-3" /></button>
                            </li>
                          );
                        })}
                      </ul>
                    ) : (
                      <p className="text-xs text-muted">Opsional: logo brand, maskot, atau ornamen tema event (PNG transparan, ≤ 5 MB).</p>
                    )}
                  </div>
                ) : null}
              </div>

              <div className="border-t border-line pt-4">
                <SwitchRow
                  title="Gaya AI"
                  description={aiConfigured ? 'Tamu mengubah fotonya menjadi ilustrasi (via OpenRouter).' : 'OPENROUTER_API_KEY belum diisi di server — fitur tidak muncul untuk tamu.'}
                  checked={form.aiEnabled}
                  onChange={(v) => set('aiEnabled', v)}
                />
                {form.aiEnabled ? (
                  <div className="mt-2 grid gap-4">
                    <Field label="Gaya siap pakai">
                      <div className="flex flex-wrap gap-2">
                        {AI_STYLES.map((s) => <Chip key={s.id} on={form.aiStyles.includes(s.id)} onClick={() => toggleIn('aiStyles', s.id)}>{s.label}</Chip>)}
                        <Chip on={form.aiStyles.includes(CUSTOM_STYLE_ID)} onClick={() => toggleIn('aiStyles', CUSTOM_STYLE_ID)}>Gaya event (prompt Anda)</Chip>
                      </div>
                      {form.aiStyles.includes(CUSTOM_STYLE_ID) && !hasCustomPrompt ? (
                        <p className="mt-1.5 text-xs text-warn">Belum ada prompt event aktif. {isAdmin ? <Link className="font-semibold underline" href={`/admin/prompts?eventId=${initial.id}`}>Buat di Prompt AI</Link> : 'Minta pemilik membuatnya.'}</p>
                      ) : null}
                    </Field>
                    <SwitchRow title="Tamu boleh menulis prompt sendiri" description="Tamu mengetik permintaannya (maks. 300 karakter). Permintaan tidak pantas ditolak oleh filter keamanan model." checked={form.aiGuestPrompt} onChange={(v) => set('aiGuestPrompt', v)} />
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
                  </div>
                ) : null}
              </div>
            </div>
          </Section>

          <Section id="galeri" title="Galeri, live & buku tamu">
            <div className="grid gap-5">
              <Field label="Siapa yang bisa melihat galeri event">
                <div className="grid gap-2 sm:grid-cols-3">
                  {VISIBILITY.map((v) => <OptionCard key={v.id} on={form.galleryVisibility === v.id} onClick={() => set('galleryVisibility', v.id)} title={v.title} body={v.body} />)}
                </div>
              </Field>
              {form.galleryVisibility !== 'private' && initial.galleryVisibility !== 'private' ? <LinkRow label="Galeri event" url={galleryUrl} onCopy={copy} /> : null}

              <div className="border-t border-line pt-4">
                <SwitchRow title="Galeri live" description="Halaman layar penuh untuk proyektor/TV. Foto & GIF baru muncul otomatis beberapa detik setelah sesi selesai." checked={form.liveEnabled} onChange={(v) => set('liveEnabled', v)} />
                {form.liveEnabled && initial.liveEnabled ? <LinkRow label="Galeri live" url={liveUrl} onCopy={copy} /> : form.liveEnabled ? <p className="text-xs text-muted">Simpan untuk mendapatkan link.</p> : null}
                {form.liveEnabled ? (
                  <div className="mt-3">
                    <p className="mb-1.5 text-[13px] font-semibold text-ink-2">Warna pintu kulkas</p>
                    <div className="flex flex-wrap gap-2">
                      {LIVE_THEMES.map((t) => (
                        <button key={t} type="button" onClick={() => set('liveTheme', t)} className={cn('flex h-12 w-20 items-end justify-start rounded-[10px] border-2 p-1.5 text-[10px] font-bold capitalize', `fridge-${t}`, form.liveTheme === t ? 'border-ink shadow-[3px_3px_0_var(--color-ink)]' : 'border-ink/20', ['red', 'green', 'maroon'].includes(t) ? 'text-white' : 'text-ink')}>
                          {t}
                        </button>
                      ))}
                    </div>
                    <p className="mt-1.5 text-xs text-muted">Foto ditempel ala kulkas (magnet, selotip, klip). Tamu bisa menempel stiker Y2K ke fotonya dari halaman QR.</p>
                  </div>
                ) : null}
              </div>

              <div className="border-t border-line pt-4">
                <SwitchRow title="Minizine" description="Tamu bisa membuat zine 8 halaman dari fotonya (di HP lewat QR, atau di booth lewat tombol 'Bikin minizine'). Lengkap dengan panduan lipat & ukuran kertas." checked={form.zineEnabled} onChange={(v) => set('zineEnabled', v)} />
              </div>

              <div className="border-t border-line pt-4">
                <SwitchRow title="Buku tamu (microsite)" description="Halaman event untuk tamu meninggalkan pesan, kesan, dan foto. Pesan juga tampil di galeri live." checked={form.guestbookEnabled} onChange={(v) => set('guestbookEnabled', v)} />
                {form.guestbookEnabled && initial.guestbookEnabled ? <LinkRow label="Buku tamu" url={bookUrl} onCopy={copy} /> : form.guestbookEnabled ? <p className="text-xs text-muted">Simpan untuk mendapatkan link.</p> : null}
                {initial.guestbookEnabled ? <p className="mt-2 text-xs text-muted">Moderasi pesan di <Link className="font-semibold text-brand" href={`/event/${code}/guestbook`}>Buku Tamu</Link>.</p> : null}
              </div>

              <Field label="Masa simpan foto" hint="Setelah lewat, link QR tidak berlaku dan file dihapus oleh job pembersihan.">
                <Select value={form.retentionDays} onChange={(e) => set('retentionDays', Number(e.target.value))} className="w-48">
                  {[1, 3, 7, 14, 30, 60, 90, 180, 365].map((n) => <option key={n} value={n}>{n} hari</option>)}
                </Select>
              </Field>
            </div>
          </Section>

          <Section id="akses" title="Status & akses">
            <div className="grid gap-4">
              <Field label="Nama event"><Input value={form.name} onChange={(e) => set('name', e.target.value)} maxLength={80} /></Field>
              <Field label="Status" hint="Draft = booth berjalan dalam mode uji. Arsip = booth tidak menerima sesi baru.">
                <Segmented value={form.status} onChange={(v) => set('status', v)} options={[{ value: 'draft', label: 'Draft' }, { value: 'active', label: 'Aktif' }, { value: 'archived', label: 'Arsip' }]} />
              </Field>
              <Field label="Catatan internal"><Textarea value={form.description ?? ''} onChange={(e) => set('description', e.target.value)} className="min-h-16" maxLength={500} /></Field>
              <div className="rounded-[12px] bg-canvas px-4 py-3 text-sm text-ink-2">
                Kode event <span className="font-mono font-bold tracking-widest">{code}</span> · PIN {initial.hasPin ? 'sudah diatur' : <b className="text-danger">belum diatur</b>}
                <p className="mt-0.5 text-xs text-muted">{isAdmin ? <>Ganti kode / PIN di <Link href="/admin/events" className="font-semibold text-brand">Portal Pemilik › Event</Link>.</> : 'Hanya pemilik yang dapat mengganti kode dan PIN.'}</p>
              </div>
            </div>
          </Section>
        </div>
      </div>

      <div className={cn('fixed right-4 bottom-[max(16px,env(safe-area-inset-bottom))] z-30 flex items-center gap-3 rounded-[14px] border border-line bg-surface px-4 py-2.5 shadow-pop transition sm:right-8', dirty ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-4 opacity-0')}>
        <span className="text-sm text-muted">Ada perubahan belum disimpan</span>
        <Button variant="ghost" size="sm" onClick={discard}>Batal</Button>
        <Button variant="primary" onClick={save} loading={saving}>Simpan</Button>
      </div>
    </div>
  );
}
