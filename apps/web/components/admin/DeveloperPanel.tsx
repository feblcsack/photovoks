'use client';

/**
 * Developer panel: health, egress, switches (maintenance / AI / payments /
 * saver mode), storage provider + migration, backup database, emergency
 * runbook and the "what if it happens again" plan. One page, no terminal
 * needed for day-to-day decisions.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, CircleDashed, Copy, Database, Download, HardDrive, LifeBuoy, Play, RefreshCcw, Server, ShieldAlert, Sparkles } from 'lucide-react';
import { PageHeader } from '@/components/shell/PortalShell';
import { Panel, PanelHeader, Stat } from '@/components/ui/panel';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { SwitchRow } from '@/components/ui/switch';
import { Field, Input, Select, Textarea } from '@/components/ui/field';
import { Segmented } from '@/components/ui/segmented';
import { Spinner } from '@/components/ui/spinner';
import { useToast } from '@/components/ui/toast';
import { WordArt } from '@/components/brand/WordArt';
import { api } from '@/lib/fetcher';
import { formatBytes } from '@/lib/compress';
import { formatRupiah, type AppSettings, type SettingsGroup } from '@/lib/settings-shared';
import { cn } from '@/lib/utils';

interface Check { id: string; label: string; ok: boolean; optional?: boolean; detail: string; ms?: number }
interface UsageDay { day: string; originBytes: number; originRequests: number; servedBytes: number; servedRequests: number }
interface Overview {
  checks: Check[];
  settings: AppSettings;
  settingsSaved: boolean;
  envOverrides: string[];
  usage: { ok: boolean; days: UsageDay[] };
  buckets: Array<{ bucket: string; files: number; bytes: number }>;
  memo: { items: number; bytes: number; limit: number };
  env: { activeDb: 'primary' | 'secondary'; secondaryConfigured: boolean; s3Configured: boolean; vercel: boolean; region: string | null; supabaseRef: string | null; appUrl: string | null };
}

const BUCKETS = ['frames', 'event-media', 'sessions', 'sketches'] as const;

export function DeveloperPanel() {
  const toast = useToast();
  const [data, setData] = useState<Overview | null>(null);
  const [draft, setDraft] = useState<AppSettings | null>(null);
  const [loading, setLoading] = useState(false);
  const [savingGroup, setSavingGroup] = useState<SettingsGroup | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api<Overview>('/api/admin/dev/status');
      setData(res);
      setDraft(res.settings);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Gagal memuat status', 'error');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data fetch
    void load();
  }, [load]);

  async function saveGroup<K extends SettingsGroup>(group: K, value: AppSettings[K]) {
    setSavingGroup(group);
    try {
      const res = await api<{ settings: AppSettings }>('/api/admin/dev/settings', { method: 'PATCH', json: { group, value } });
      setDraft(res.settings);
      setData((d) => (d ? { ...d, settings: res.settings } : d));
      toast('Tersimpan — berlaku dalam ±20 detik di semua perangkat');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Gagal menyimpan', 'error');
    } finally {
      setSavingGroup(null);
    }
  }

  const setD = <K extends SettingsGroup>(group: K, patch: Partial<AppSettings[K]>) => setDraft((d) => (d ? { ...d, [group]: { ...d[group], ...patch } } : d));
  const dirty = (g: SettingsGroup) => !!data && !!draft && JSON.stringify(data.settings[g]) !== JSON.stringify(draft[g]);

  if (!data || !draft) {
    return (
      <div>
        <PageHeader title="Developer" description="Memeriksa sistem…" />
        <div className="flex justify-center py-20"><Spinner className="size-7" /></div>
      </div>
    );
  }

  const failing = data.checks.filter((c) => !c.ok && !c.optional);
  const month = data.usage.days.filter((d) => d.day.slice(0, 7) === new Date().toISOString().slice(0, 7));
  const monthOrigin = month.reduce((s, d) => s + d.originBytes, 0);
  const monthServed = month.reduce((s, d) => s + d.servedBytes, 0);
  const quotaBytes = draft.quota.egressGb * 1024 ** 3;
  const dayOfMonth = new Date().getDate();
  const daysInMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();
  const projected = dayOfMonth ? (monthOrigin / dayOfMonth) * daysInMonth : 0;
  const pct = Math.min(100, (monthOrigin / quotaBytes) * 100);
  const savedPct = monthServed ? Math.max(0, 100 - (monthOrigin / monthServed) * 100) : 0;
  const maxDay = Math.max(1, ...data.usage.days.map((d) => d.originBytes));
  const totalStored = data.buckets.reduce((s, b) => s + b.bytes, 0);

  return (
    <div>
      <PageHeader
        title={<WordArt variant="chrome" className="text-[34px]">Panel Developer</WordArt>}
        description="Status sistem, egress, saklar darurat, penyimpanan & database cadangan."
        actions={<Button variant="secondary" onClick={() => void load()} loading={loading}><RefreshCcw /> Periksa ulang</Button>}
      />

      {failing.length ? (
        <div className="mb-6 flex items-start gap-3 rounded-panel border-2 border-danger bg-danger-soft px-5 py-4">
          <ShieldAlert className="mt-0.5 size-5 shrink-0 text-danger" />
          <div className="text-sm">
            <p className="font-bold text-danger">{failing.length} pemeriksaan gagal</p>
            <p className="text-ink-2">{failing.map((f) => f.label).join(' · ')} — lihat langkah di <a href="#darurat" className="font-semibold underline">Kalau website down</a>.</p>
          </div>
        </div>
      ) : null}
      {data.envOverrides.length ? (
        <p className="mb-6 rounded-[12px] bg-warn-soft px-4 py-3 text-sm text-warn">Env override aktif: <b>{data.envOverrides.join(', ')}</b> — nilai ini mengalahkan saklar di bawah (dipakai saat database tidak bisa diakses).</p>
      ) : null}

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Egress dari storage (bulan ini)" value={formatBytes(monthOrigin)} hint={`dari kuota ${draft.quota.egressGb} GB · proyeksi ${formatBytes(projected)}`} />
        <Stat label="Dihemat oleh cache" value={`${savedPct.toFixed(0)}%`} hint={`${formatBytes(monthServed)} dilayani server`} />
        <Stat label="Total file tersimpan" value={formatBytes(totalStored)} hint={`${data.buckets.reduce((s, b) => s + b.files, 0)} file`} />
        <Stat label="Database aktif" value={data.env.activeDb === 'primary' ? 'Utama' : 'Cadangan'} hint={data.env.region ? `Server: ${data.env.region}` : data.env.vercel ? 'Vercel' : 'Server lokal / VPS'} />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        {/* ── Status ─────────────────────────────────────────────────────── */}
        <Panel>
          <PanelHeader title="Status sistem" icon={<Server />} description="Diperiksa langsung dari server saat halaman dibuka." />
          <ul className="flex flex-col gap-1 p-3">
            {data.checks.map((c) => (
              <li key={c.id} className="flex items-start gap-2.5 rounded-[10px] px-2 py-2 text-sm">
                {c.ok ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-ok" /> : c.optional ? <CircleDashed className="mt-0.5 size-4 shrink-0 text-faint" /> : <AlertTriangle className="mt-0.5 size-4 shrink-0 text-danger" />}
                <span className="min-w-0">
                  <span className={cn('block font-semibold', !c.ok && !c.optional && 'text-danger')}>{c.label}</span>
                  <span className="block text-xs break-words text-muted">{c.detail}</span>
                </span>
              </li>
            ))}
          </ul>
        </Panel>

        {/* ── Egress ─────────────────────────────────────────────────────── */}
        <Panel>
          <PanelHeader title="Egress storage (31 hari)" icon={<HardDrive />} description="Byte yang benar-benar ditarik dari Supabase/R2 lewat /media. Tampilan berulang dilayani cache browser & CDN (gratis)." />
          <div className="p-5">
            <div className="mb-1.5 flex items-baseline justify-between text-xs">
              <span className="font-semibold">Bulan ini: {formatBytes(monthOrigin)} / {draft.quota.egressGb} GB</span>
              <span className={cn(pct > draft.quota.warnPercent ? 'font-bold text-danger' : 'text-muted')}>{pct.toFixed(1)}%</span>
            </div>
            <div className="h-3 overflow-hidden rounded-full bg-ink/10">
              <div className={cn('h-full rounded-full', pct > draft.quota.warnPercent ? 'bg-danger' : 'bg-ok')} style={{ width: `${Math.max(1, pct)}%` }} />
            </div>
            {!data.usage.ok ? (
              <p className="mt-4 text-xs text-warn">Penghitung belum aktif — jalankan migrasi v5.</p>
            ) : (
              <div className="mt-5 flex h-28 items-end gap-[3px]" role="img" aria-label="Grafik egress harian">
                {data.usage.days.map((d) => (
                  <div key={d.day} className="group relative flex h-full flex-1 items-end">
                    <div className="w-full rounded-t-[2px] bg-cobalt/80 group-hover:bg-brand" style={{ height: `${Math.max(d.originBytes ? 3 : 0, (d.originBytes / maxDay) * 100)}%` }} />
                    <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 rounded bg-ink px-1.5 py-0.5 text-[10px] whitespace-nowrap text-white group-hover:block">{d.day.slice(5)} · {formatBytes(d.originBytes)}</span>
                  </div>
                ))}
              </div>
            )}
            <div className="mt-4 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
              {data.buckets.map((b) => (
                <div key={b.bucket} className="rounded-[10px] border border-line px-2.5 py-2">
                  <p className="font-mono font-semibold">{b.bucket}</p>
                  <p className="text-muted">{formatBytes(b.bytes)} · {b.files} file</p>
                </div>
              ))}
            </div>
            <p className="mt-4 text-xs leading-relaxed text-muted">
              Angka resmi (termasuk database & egress sebelum pembaruan ini) ada di{' '}
              <a className="font-semibold text-brand" href={data.env.supabaseRef ? `https://supabase.com/dashboard/project/${data.env.supabaseRef}` : 'https://supabase.com/dashboard'} target="_blank" rel="noreferrer">dashboard Supabase › Usage</a>. Kuota free dihitung <b>per organisasi</b>, reset tiap siklus tagihan.
            </p>
            <div className="mt-3 flex items-end gap-2">
              <Field label="Kuota egress (GB)" className="w-36">
                <Input type="number" min={1} value={draft.quota.egressGb} onChange={(e) => setD('quota', { egressGb: Number(e.target.value) || 5 })} />
              </Field>
              <Button size="sm" variant="secondary" disabled={!dirty('quota')} loading={savingGroup === 'quota'} onClick={() => void saveGroup('quota', draft.quota)}>Simpan</Button>
            </div>
          </div>
        </Panel>

        {/* ── Switches ───────────────────────────────────────────────────── */}
        <Panel>
          <PanelHeader title="Saklar" icon={<Sparkles />} description="Berlaku untuk semua event. Tersimpan di database (±20 detik)." />
          <div className="divide-y divide-line px-5">
            <div className="py-2">
              <SwitchRow title="Mode perawatan (maintenance)" description="Halaman tamu (QR, live wall, buku tamu, galeri) menampilkan layar perawatan." checked={draft.maintenance.enabled} onChange={(v) => setD('maintenance', { enabled: v })} />
              {draft.maintenance.enabled ? (
                <div className="flex flex-col gap-2 pb-2">
                  <Textarea rows={2} value={draft.maintenance.message} onChange={(e) => setD('maintenance', { message: e.target.value })} aria-label="Pesan perawatan" />
                  <SwitchRow title="Booth tetap jalan" description="Booth tetap bisa foto & cetak; hanya halaman tamu yang ditutup." checked={draft.maintenance.keepBooth} onChange={(v) => setD('maintenance', { keepBooth: v })} />
                </div>
              ) : null}
              <SaveRow show={dirty('maintenance')} loading={savingGroup === 'maintenance'} onSave={() => void saveGroup('maintenance', draft.maintenance)} />
            </div>
            <div className="py-2">
              <SwitchRow title="Gaya AI (semua event)" description="Matikan untuk menghentikan semua generate AI — tombol AI hilang di booth & HP tamu." checked={draft.ai.enabled} onChange={(v) => setD('ai', { enabled: v })} />
              <SaveRow show={dirty('ai')} loading={savingGroup === 'ai'} onSave={() => void saveGroup('ai', draft.ai)} />
            </div>
            <div className="py-2">
              <SwitchRow title="Pembayaran" description="Matikan = semua sesi & AI gratis (mis. saat QRIS bermasalah)." checked={draft.payments.enabled} onChange={(v) => setD('payments', { enabled: v })} />
              <Field label="Gateway QRIS" className="pb-2" hint="Otomatis = DOKU jika terpasang, lalu Aulaa. Tanpa gateway, tamu bayar di kasir.">
                <Select value={draft.payments.provider} onChange={(e) => setD('payments', { provider: e.target.value as AppSettings['payments']['provider'] })}>
                  <option value="auto">Otomatis</option>
                  <option value="doku">DOKU Checkout</option>
                  <option value="aulaa">Aulaa</option>
                </Select>
              </Field>
              <div className="grid grid-cols-2 gap-3 pb-2">
                <Field label="Harga AI default" hint={formatRupiah(draft.payments.defaultAiPrice)}>
                  <Input type="number" min={0} step={500} value={draft.payments.defaultAiPrice} onChange={(e) => setD('payments', { defaultAiPrice: Number(e.target.value) || 0 })} />
                </Field>
                <Field label="Batas waktu bayar (menit)">
                  <Input type="number" min={3} max={120} value={draft.payments.expiryMinutes} onChange={(e) => setD('payments', { expiryMinutes: Number(e.target.value) || 15 })} />
                </Field>
              </div>
              <SaveRow show={dirty('payments')} loading={savingGroup === 'payments'} onSave={() => void saveGroup('payments', draft.payments)} />
            </div>
            <div className="py-2">
              <SwitchRow title="Mode hemat" description="Pratinjau lebih kecil & polling lebih jarang. Nyalakan kalau kuota menipis." checked={draft.performance.liteMode} onChange={(v) => setD('performance', { liteMode: v, imageQuality: v ? 'saver' : draft.performance.imageQuality === 'saver' ? 'balanced' : draft.performance.imageQuality, livePollSeconds: v ? Math.max(15, draft.performance.livePollSeconds) : draft.performance.livePollSeconds })} />
              <div className="grid gap-3 pb-2 sm:grid-cols-3">
                <Field label="Kualitas pratinjau">
                  <Select value={draft.performance.imageQuality} onChange={(e) => setD('performance', { imageQuality: e.target.value as AppSettings['performance']['imageQuality'] })}>
                    <option value="saver">Hemat (WebP 68)</option>
                    <option value="balanced">Seimbang (WebP 78)</option>
                    <option value="high">Tinggi (WebP 86)</option>
                  </Select>
                </Field>
                <Field label="Live wall cek (detik)">
                  <Input type="number" min={3} max={120} value={draft.performance.livePollSeconds} onChange={(e) => setD('performance', { livePollSeconds: Number(e.target.value) || 8 })} />
                </Field>
                <Field label="Print station cek (detik)">
                  <Input type="number" min={2} max={60} value={draft.performance.printPollSeconds} onChange={(e) => setD('performance', { printPollSeconds: Number(e.target.value) || 5 })} />
                </Field>
              </div>
              <SaveRow show={dirty('performance')} loading={savingGroup === 'performance'} onSave={() => void saveGroup('performance', draft.performance)} />
            </div>
          </div>
        </Panel>

        {/* ── Storage ────────────────────────────────────────────────────── */}
        <StoragePanel data={data} draft={draft} setD={setD} dirty={dirty('storage')} saving={savingGroup === 'storage'} onSave={() => void saveGroup('storage', draft.storage)} />

        {/* ── Database ───────────────────────────────────────────────────── */}
        <DatabasePanel data={data} />

        {/* ── Plan B ─────────────────────────────────────────────────────── */}
        <PlanPanel />
      </div>

      <Runbook />
    </div>
  );
}

function SaveRow({ show, loading, onSave }: { show: boolean; loading: boolean; onSave: () => void }) {
  if (!show) return null;
  return (
    <div className="flex justify-end pb-2">
      <Button size="sm" variant="primary" loading={loading} onClick={onSave}>Simpan perubahan</Button>
    </div>
  );
}

function CodeBlock({ children }: { children: string }) {
  const toast = useToast();
  return (
    <div className="group relative">
      <pre className="overflow-x-auto rounded-[10px] bg-ink px-3 py-2.5 font-mono text-[11.5px] leading-relaxed text-[#E8F0FF]">{children}</pre>
      <button type="button" onClick={() => navigator.clipboard.writeText(children).then(() => toast('Disalin'))} className="absolute top-1.5 right-1.5 flex size-7 items-center justify-center rounded-[6px] bg-white/10 text-white opacity-0 group-hover:opacity-100" aria-label="Salin"><Copy className="size-3.5" /></button>
    </div>
  );
}

function StoragePanel({ data, draft, setD, dirty, saving, onSave }: { data: Overview; draft: AppSettings; setD: <K extends SettingsGroup>(g: K, p: Partial<AppSettings[K]>) => void; dirty: boolean; saving: boolean; onSave: () => void }) {
  const toast = useToast();
  const [testing, setTesting] = useState<string | null>(null);
  const [mig, setMig] = useState<{ running: boolean; bucket: string; copied: number; bytes: number; failed: number; log: string[] }>({ running: false, bucket: '', copied: 0, bytes: 0, failed: 0, log: [] });
  const [direction, setDirection] = useState<'supabase>s3' | 's3>supabase'>('supabase>s3');

  async function test(driver: 'supabase' | 's3') {
    setTesting(driver);
    try {
      const res = await api<{ ok: boolean; detail: string }>('/api/admin/dev/storage-test', { method: 'POST', json: { driver } });
      toast(`${driver === 's3' ? 'S3/R2' : 'Supabase'}: ${res.detail}`, res.ok ? 'success' : 'error');
    } finally {
      setTesting(null);
    }
  }

  async function migrate() {
    const [from, to] = direction.split('>') as ['supabase' | 's3', 'supabase' | 's3'];
    setMig({ running: true, bucket: '', copied: 0, bytes: 0, failed: 0, log: [] });
    let copied = 0;
    let bytes = 0;
    let failed = 0;
    const log: string[] = [];
    try {
      for (const bucket of BUCKETS) {
        let after: string | null = null;
        for (let i = 0; i < 2000; i++) {
          setMig({ running: true, bucket, copied, bytes, failed, log });
          const res: { copied: number; bytes: number; failed: string[]; next: string | null; done: boolean } = await api('/api/admin/dev/storage-migrate', { method: 'POST', json: { from, to, bucket, after } });
          copied += res.copied;
          bytes += res.bytes;
          failed += res.failed.length;
          if (res.failed.length) log.push(...res.failed.slice(0, 5).map((f) => `${bucket}/${f}`));
          if (res.done || !res.next) break;
          after = res.next;
        }
      }
      toast(`Migrasi selesai: ${copied} file (${formatBytes(bytes)})`);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Migrasi gagal', 'error');
    } finally {
      setMig({ running: false, bucket: '', copied, bytes, failed, log });
    }
  }

  return (
    <Panel>
      <PanelHeader title="Penyimpanan foto" icon={<HardDrive />} description="Tempat file BARU disimpan. File lama tetap terbaca dari penyimpanan lain (fallback)." />
      <div className="flex flex-col gap-4 p-5">
        <Segmented
          value={draft.storage.driver}
          onChange={(v) => setD('storage', { driver: v })}
          options={[
            { value: 'supabase', label: 'Supabase Storage' },
            { value: 's3', label: `Cloudflare R2 / S3${data.env.s3Configured ? '' : ' (belum diatur)'}` },
          ]}
        />
        {draft.storage.driver === 's3' && !data.env.s3Configured ? <p className="text-xs text-danger">S3/R2 belum dikonfigurasi — upload akan tetap ke Supabase sampai env di bawah diisi.</p> : null}
        <SwitchRow title="Baca dari penyimpanan lain jika file tidak ada" description="Wajib nyala selama migrasi agar foto lama tetap tampil." checked={draft.storage.readFallback} onChange={(v) => setD('storage', { readFallback: v })} />
        <SaveRow show={dirty} loading={saving} onSave={onSave} />
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" onClick={() => void test('supabase')} loading={testing === 'supabase'}><Play /> Tes Supabase</Button>
          <Button size="sm" variant="secondary" onClick={() => void test('s3')} loading={testing === 's3'} disabled={!data.env.s3Configured}><Play /> Tes R2/S3</Button>
        </div>
        <details className="rounded-[12px] border border-line px-4 py-3">
          <summary className="cursor-pointer text-sm font-semibold">Cara pasang Cloudflare R2 (egress gratis)</summary>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-xs leading-relaxed text-ink-2">
            <li>dash.cloudflare.com › R2 › Create bucket (mis. <code>photovoks</code>, lokasi Asia-Pasifik).</li>
            <li>R2 › Manage API tokens › Create token (Object Read &amp; Write untuk bucket itu).</li>
            <li>Bucket › Settings › CORS policy: izinkan <code>PUT</code> &amp; <code>GET</code> dari domain website kamu.</li>
            <li>Isi env di Vercel (Settings › Environment Variables), lalu Redeploy:</li>
          </ol>
          <div className="mt-2">
            <CodeBlock>{`S3_ENDPOINT=https://<ACCOUNT_ID>.r2.cloudflarestorage.com
S3_BUCKET=photovoks
S3_ACCESS_KEY_ID=...
S3_SECRET_ACCESS_KEY=...
S3_REGION=auto`}</CodeBlock>
          </div>
          <p className="mt-2 text-xs text-muted">CORS contoh:</p>
          <CodeBlock>{`[{ "AllowedOrigins": ["https://domainkamu.com"], "AllowedMethods": ["GET", "PUT"], "AllowedHeaders": ["*"], "MaxAgeSeconds": 3600 }]`}</CodeBlock>
          <p className="mt-2 text-xs text-muted">Lalu pilih “Cloudflare R2 / S3” di atas, Simpan, dan jalankan migrasi di bawah (opsional — file lama tetap terbaca dari Supabase).</p>
        </details>
        <div className="rounded-[12px] border border-line px-4 py-3">
          <p className="text-sm font-semibold">Migrasi file</p>
          <p className="mb-2 text-xs text-muted">Menyalin semua file (file asal tidak dihapus). Bisa dijalankan ulang — file yang sudah ada ditimpa.</p>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={direction} onChange={(e) => setDirection(e.target.value as typeof direction)} className="w-56">
              <option value="supabase>s3">Supabase → R2/S3</option>
              <option value="s3>supabase">R2/S3 → Supabase</option>
            </Select>
            <Button size="sm" variant="primary" onClick={() => void migrate()} loading={mig.running} disabled={!data.env.s3Configured}>Mulai migrasi</Button>
          </div>
          {mig.running || mig.copied ? (
            <p className="mt-2 font-mono text-xs">{mig.running ? `⏳ ${mig.bucket} · ` : '✓ '} {mig.copied} file · {formatBytes(mig.bytes)}{mig.failed ? ` · ${mig.failed} gagal` : ''}</p>
          ) : null}
          {mig.log.length ? <p className="mt-1 text-[11px] break-all text-danger">Gagal: {mig.log.slice(0, 5).join(', ')}</p> : null}
        </div>
        <p className="text-xs text-muted">Cache memori server: {data.memo.items} file · {formatBytes(data.memo.bytes)} / {formatBytes(data.memo.limit)}</p>
      </div>
    </Panel>
  );
}

function DatabasePanel({ data }: { data: Overview }) {
  const toast = useToast();
  const [cloning, setCloning] = useState(false);
  const [withSessions, setWithSessions] = useState(false);
  const [report, setReport] = useState<Array<{ table: string; rows: number; error?: string }> | null>(null);

  async function clone() {
    if (!confirm(`Salin data dari database ${data.env.activeDb === 'primary' ? 'utama → cadangan' : 'cadangan → utama'}? Data di tujuan dengan ID sama akan ditimpa.`)) return;
    setCloning(true);
    try {
      const res = await api<{ report: Array<{ table: string; rows: number; error?: string }> }>('/api/admin/dev/clone', { method: 'POST', json: { includeSessions: withSessions } });
      setReport(res.report);
      toast(res.report.some((r) => r.error) ? 'Selesai dengan error — lihat detail' : 'Data tersalin', res.report.some((r) => r.error) ? 'error' : 'success');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Gagal', 'error');
    } finally {
      setCloning(false);
    }
  }

  return (
    <Panel>
      <PanelHeader title="Database cadangan" icon={<Database />} description="Project Supabase kedua (di organisasi lain) yang siap dipakai kalau yang utama kena limit/down." />
      <div className="flex flex-col gap-4 p-5 text-sm">
        <div className="flex flex-wrap gap-2">
          <Badge tone={data.env.activeDb === 'primary' ? 'ok' : 'warn'} dot>Aktif: {data.env.activeDb === 'primary' ? 'utama' : 'cadangan'}</Badge>
          <Badge tone={data.env.secondaryConfigured ? 'ok' : 'neutral'} dot>Cadangan {data.env.secondaryConfigured ? 'terpasang' : 'belum diatur'}</Badge>
        </div>
        <ol className="list-decimal space-y-1.5 pl-5 text-xs leading-relaxed text-ink-2">
          <li>Buat <b>organisasi baru</b> di Supabase (kuota gratis dihitung per organisasi), lalu project baru di region Sydney/Singapura.</li>
          <li>Di komputer: <code>pnpm -s db:sql | pbcopy</code> → tempel di SQL Editor project baru → Run.</li>
          <li>Isi env lalu Redeploy:</li>
        </ol>
        <CodeBlock>{`SUPABASE_URL_2=https://<project-baru>.supabase.co
SUPABASE_SERVICE_ROLE_KEY_2=...`}</CodeBlock>
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="secondary" onClick={() => void clone()} loading={cloning} disabled={!data.env.secondaryConfigured}><Database /> Salin data inti ke {data.env.activeDb === 'primary' ? 'cadangan' : 'utama'}</Button>
          <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={withSessions} onChange={(e) => setWithSessions(e.target.checked)} /> ikut sesi & buku tamu</label>
        </div>
        {report ? (
          <ul className="grid grid-cols-2 gap-1 font-mono text-[11px]">
            {report.map((r) => (
              <li key={r.table} className={r.error ? 'text-danger' : 'text-ink-2'}>{r.error ? '✕' : '✓'} {r.table}: {r.rows}{r.error ? ` — ${r.error}` : ''}</li>
            ))}
          </ul>
        ) : null}
        <p className="text-xs leading-relaxed text-muted">
          4. Untuk pindah: set <code>DB_ACTIVE=secondary</code> di env lalu Redeploy (±1 menit). Booth, portal, dan pembayaran langsung memakai database cadangan; foto lama tetap terbaca dari project lama selama masih bisa diakses (atau dari R2). Juga ganti <code>NEXT_PUBLIC_SUPABASE_URL</code>/<code>ANON_KEY</code> ke project baru bila project lama dihapus.
        </p>
        <a href="/api/admin/dev/export" className="contents"><Button variant="ghost" size="sm" className="self-start"><Download /> Unduh backup konfigurasi (JSON)</Button></a>
      </div>
    </Panel>
  );
}

function PlanPanel() {
  const rows = [
    { title: 'Sekarang: Supabase Free + cache (sudah diterapkan)', cost: 'Rp 0', body: 'Foto lewat URL stabil + CDN + WebP kecil. Egress turun ±90–98% dibanding sebelumnya (dulu 4,9 GB/hari dari 14 sesi).', pick: true },
    { title: 'Cloudflare R2 untuk foto (paling direkomendasikan)', cost: 'Rp 0 s/d 10 GB', body: 'Egress R2 selalu gratis, 10 GB storage gratis/bulan. Database tetap Supabase (egress DB kecil). Ganti cukup lewat panel ini + 4 env.', pick: true },
    { title: 'Supabase Pro', cost: '± $25/bln', body: '250 GB egress + 250 GB cached egress, tanpa project pause. Paling sedikit kerja, tapi berbayar.' },
    { title: 'Project Supabase baru (organisasi lain)', cost: 'Rp 0', body: 'Kuota reset karena terpisah per organisasi. Pakai “Database cadangan” di panel ini. Cocok sebagai darurat, bukan solusi permanen.' },
    { title: 'VPS sendiri (mis. 2 vCPU/4 GB)', cost: '± Rp 70–150 rb/bln', body: 'Jalankan `pnpm booth` + MinIO (S3) di VPS; bandwidth biasanya 1–2 TB. Butuh merawat server (update, backup, SSL).' },
  ];
  return (
    <Panel>
      <PanelHeader title="Kalau egress habis lagi — pilihan" icon={<LifeBuoy />} description="Urut dari yang paling disarankan. Harga per Nov 2026, cek ulang sebelum membeli." />
      <ul className="divide-y divide-line">
        {rows.map((r) => (
          <li key={r.title} className="px-5 py-3">
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm font-bold">{r.title}</p>
              <Badge tone={r.pick ? 'ok' : 'neutral'}>{r.cost}</Badge>
            </div>
            <p className="mt-0.5 text-xs leading-relaxed text-muted">{r.body}</p>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function Runbook() {
  return (
    <section id="darurat" className="mt-6 scroll-mt-24">
      <Panel>
        <PanelHeader title="Kalau website down / error — langkah cepat" icon={<ShieldAlert />} />
        <ol className="grid gap-3 p-5 text-sm md:grid-cols-2">
          {[
            ['Cek status', 'Buka /api/health (200 = database OK, 503 = database tidak bisa diakses). Pasang di UptimeRobot/Better Stack agar dapat notifikasi.'],
            ['Booth tetap aman', 'Jika internet/server putus saat foto, hasil tetap di perangkat booth dan tombol “Coba lagi” muncul. Jangan tutup tab booth.'],
            ['Kuota Supabase habis (error 402)', 'Set env MAINTENANCE_MODE=1 bila perlu, nyalakan database cadangan (DB_ACTIVE=secondary) + R2, lalu Redeploy. Atau upgrade ke Pro — restriksi langsung dicabut.'],
            ['QRIS bermasalah', 'Ganti mode pembayaran event ke “Kasir saja”, atau matikan Pembayaran di Saklar. Pembayaran tunai disetujui di menu Pembayaran.'],
            ['AI error / kredit habis', 'Matikan “Gaya AI” di Saklar (tombol AI langsung hilang). Pembayaran AI yang gagal karena filter otomatis dikembalikan.'],
            ['Pengumuman ke tamu', 'Nyalakan Mode perawatan dengan pesan singkat. Booth bisa tetap jalan.'],
          ].map(([t, b], i) => (
            <li key={t} className="flex gap-3 rounded-[12px] border border-line p-3">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-ink font-techno text-xs font-bold text-white">{i + 1}</span>
              <span><b className="block">{t}</b><span className="text-xs leading-relaxed text-muted">{b}</span></span>
            </li>
          ))}
        </ol>
      </Panel>
    </section>
  );
}
