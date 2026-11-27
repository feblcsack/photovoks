/**
 * Developer panel back-end (SERVER ONLY): health checks, storage tests and
 * migration, cloning core data to a fresh Supabase project, config backup.
 */
import { createServerClient, activeDbProfile, dbProfileConfig, type DbProfile } from '@/lib/supabase/server';
import { DRIVERS, BUCKETS, type BucketName } from '@/lib/storage/drivers';
import { envOverrides, getStoredSettings, settingsReachable } from '@/lib/settings';
import { isAiConfigured, getProvider } from '@/lib/ai/provider';
import { aulaaConfigured, aulaaWebhookConfigured } from '@/lib/payments/aulaa';
import { memoStats } from '@/lib/storage/memo-cache';
import { usageHistory } from '@/lib/usage';
import type { StorageDriverId } from '@/lib/settings-shared';

export interface Check {
  id: string;
  label: string;
  ok: boolean;
  /** Optional = not configured is fine (shown grey, not red). */
  optional?: boolean;
  detail: string;
  ms?: number;
}

async function timed<T>(fn: () => Promise<T>): Promise<{ ms: number; value?: T; error?: string }> {
  const t = Date.now();
  try {
    const value = await Promise.race([fn(), new Promise<never>((_, rej) => setTimeout(() => rej(new Error('timeout 8 s')), 8000))]);
    return { ms: Date.now() - t, value };
  } catch (e) {
    return { ms: Date.now() - t, error: e instanceof Error ? e.message : String(e) };
  }
}

async function dbCheck(profile: DbProfile): Promise<Check> {
  const cfg = dbProfileConfig(profile);
  const label = profile === 'primary' ? 'Database utama' : 'Database cadangan';
  if (!cfg.configured) return { id: `db-${profile}`, label, ok: false, optional: profile === 'secondary', detail: profile === 'secondary' ? 'Belum diatur (SUPABASE_URL_2 + SUPABASE_SERVICE_ROLE_KEY_2)' : 'Env belum diatur' };
  const r = await timed(async () => {
    const { error } = await createServerClient(profile).from('events').select('id', { head: true, count: 'exact' }).limit(1);
    if (error) throw new Error(error.message || `HTTP ${(error as { code?: string }).code ?? ''}`);
    return true;
  });
  const host = cfg.url!.replace(/^https?:\/\//, '').split('.')[0];
  const active = activeDbProfile() === profile;
  return {
    id: `db-${profile}`,
    label: `${label}${active ? ' (aktif)' : ''}`,
    ok: !r.error,
    detail: r.error ? `${host}: ${r.error}${/402|quota|restrict/i.test(r.error) ? ' — kemungkinan kuota Supabase habis' : ''}` : `${host} · ${r.ms} ms`,
    ms: r.ms,
  };
}

async function migrationCheck(): Promise<Check> {
  const r = await timed(async () => {
    const [a, b, c] = await Promise.all([
      createServerClient().from('app_settings').select('key', { head: true }).limit(1),
      createServerClient().from('payments').select('id', { head: true }).limit(1),
      createServerClient().from('sticker_assets').select('id', { head: true }).limit(1),
    ]);
    const err = a.error ?? b.error ?? c.error;
    if (err) throw new Error(err.message);
    return true;
  });
  return { id: 'migration', label: 'Migrasi v5 (pembayaran, panel, stiker)', ok: !r.error, detail: r.error ? 'Belum dijalankan — salin SQL di bawah ke Supabase › SQL Editor' : 'Terpasang' };
}

export async function storageCheck(id: StorageDriverId): Promise<Check> {
  const d = DRIVERS[id];
  if (!d.configured()) return { id: `storage-${id}`, label: d.label, ok: false, optional: id !== 'supabase', detail: 'Belum diatur (S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY)' };
  const r = await timed(() => d.list('frames', 'frames'));
  return { id: `storage-${id}`, label: d.label, ok: !r.error, detail: r.error ?? `Terhubung · ${r.ms} ms`, ms: r.ms };
}

/** Write → read → delete a tiny file. */
export async function storageRoundTrip(id: StorageDriverId): Promise<{ ok: boolean; detail: string }> {
  const d = DRIVERS[id];
  if (!d.configured()) return { ok: false, detail: 'Belum dikonfigurasi' };
  const path = `healthcheck/${crypto.randomUUID()}.png`;
  // 1×1 transparent PNG
  const body = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
  const t = Date.now();
  try {
    await d.upload('frames', path, body, 'image/png');
    const got = await d.download('frames', path);
    await d.remove('frames', [path]);
    if (!got || got.body.length !== body.length) return { ok: false, detail: 'File tertulis tapi gagal dibaca ulang' };
    return { ok: true, detail: `Tulis + baca + hapus OK · ${Date.now() - t} ms` };
  } catch (e) {
    return { ok: false, detail: e instanceof Error ? e.message : String(e) };
  }
}

export async function healthChecks(): Promise<Check[]> {
  const provider = getProvider();
  const [primary, secondary, migration, supa, s3] = await Promise.all([dbCheck('primary'), dbCheck('secondary'), migrationCheck(), storageCheck('supabase'), storageCheck('s3')]);
  return [
    primary,
    secondary,
    migration,
    supa,
    s3,
    { id: 'ai', label: 'Provider AI', ok: isAiConfigured(), optional: true, detail: isAiConfigured() ? `${provider.id} · ${provider.model()}` : 'OPENROUTER_API_KEY kosong' },
    { id: 'qris', label: 'QRIS (Aulaa)', ok: aulaaConfigured(), optional: true, detail: aulaaConfigured() ? `API key terpasang · webhook ${aulaaWebhookConfigured() ? 'terverifikasi' : 'BELUM (AULAA_WEBHOOK_SECRET)'}` : 'AULAA_API_KEY kosong — pakai pembayaran kasir' },
    { id: 'secret', label: 'Rahasia sesi', ok: (process.env.ADMIN_SESSION_SECRET?.length ?? 0) >= 32, detail: (process.env.ADMIN_SESSION_SECRET?.length ?? 0) >= 32 ? 'ADMIN_SESSION_SECRET ≥ 32 karakter' : 'ADMIN_SESSION_SECRET terlalu pendek/kosong' },
  ];
}

export async function storageUsage(): Promise<Array<{ bucket: string; files: number; bytes: number }>> {
  const { data, error } = await createServerClient().rpc('storage_usage');
  if (error) return [];
  return ((data ?? []) as Array<{ bucket: string; files: number; bytes: number }>).map((r) => ({ bucket: r.bucket, files: Number(r.files), bytes: Number(r.bytes) }));
}

export async function devOverview() {
  const [checks, settings, usage, buckets] = await Promise.all([healthChecks(), getStoredSettings(), usageHistory(31), storageUsage()]);
  const primaryUrl = dbProfileConfig('primary').url ?? '';
  const ref = /https:\/\/([a-z0-9]+)\.supabase\.co/.exec(primaryUrl)?.[1] ?? null;
  return {
    checks,
    settings,
    settingsSaved: settingsReachable(),
    envOverrides: envOverrides(),
    usage,
    buckets,
    memo: memoStats(),
    env: {
      activeDb: activeDbProfile(),
      secondaryConfigured: dbProfileConfig('secondary').configured,
      s3Configured: DRIVERS.s3.configured(),
      vercel: Boolean(process.env.VERCEL),
      region: process.env.VERCEL_REGION ?? null,
      supabaseRef: ref,
      appUrl: process.env.APP_URL ?? null,
    },
  };
}

// ── Storage migration (copy files between providers) ───────────────────────

export async function migrateBatch(from: StorageDriverId, to: StorageDriverId, bucket: BucketName, after: string | null, limit = 25) {
  if (from === to) throw new Error('Sumber dan tujuan sama');
  if (!BUCKETS.includes(bucket)) throw new Error('Bucket tidak valid');
  const src = DRIVERS[from];
  const dst = DRIVERS[to];
  if (!src.configured() || !dst.configured()) throw new Error('Kedua penyimpanan harus sudah dikonfigurasi');
  const list = await src.listAll(bucket, after, Math.min(50, limit));
  let copied = 0;
  let bytes = 0;
  const failed: string[] = [];
  // Small concurrency keeps the request well under the function time limit.
  const queue = [...list];
  await Promise.all(
    Array.from({ length: 4 }, async () => {
      while (queue.length) {
        const o = queue.shift()!;
        if (o.path.startsWith('healthcheck/')) continue;
        try {
          const obj = await src.download(bucket, o.path);
          if (!obj) throw new Error('missing');
          await dst.upload(bucket, o.path, obj.body, obj.contentType);
          copied++;
          bytes += obj.body.length;
        } catch {
          failed.push(o.path);
        }
      }
    }),
  );
  const next = list.length ? list[list.length - 1].path : null;
  return { copied, bytes, failed, next, done: list.length < Math.min(50, limit) };
}

// ── Clone core data to the other database profile ───────────────────────────

// Order respects foreign keys. events ↔ prompt_templates reference each other,
// so events are copied first without their active template, then again in full.
const CORE_TABLES = ['admin_users', 'events:bare', 'prompt_templates', 'events', 'frames', 'event_frames', 'app_settings', 'sticker_assets'] as const;
const SESSION_TABLES = ['sessions', 'ai_generations', 'print_jobs', 'guestbook_entries'] as const;
const CONFLICT: Record<string, string> = { app_settings: 'key', event_frames: 'event_id,frame_id' };

export async function cloneDatabase(opts: { to: DbProfile; includeSessions: boolean }) {
  const from = activeDbProfile();
  if (from === opts.to) throw new Error('Tujuan sama dengan database aktif');
  if (!dbProfileConfig(opts.to).configured) throw new Error('Database tujuan belum dikonfigurasi');
  const src = createServerClient(from);
  const dst = createServerClient(opts.to);
  const report: Array<{ table: string; rows: number; error?: string }> = [];
  const tables = [...CORE_TABLES, ...(opts.includeSessions ? SESSION_TABLES : [])];
  for (const entry of tables) {
    const [table, mode] = entry.split(':');
    let rows = 0;
    let error: string | undefined;
    for (let page = 0; page < 200; page++) {
      const { data, error: readErr } = await src.from(table).select('*').range(page * 500, page * 500 + 499);
      if (readErr) {
        error = readErr.message;
        break;
      }
      if (!data?.length) break;
      // Payments are not cloned: drop references to them.
      const clean = data.map((r) => (table === 'sessions' || table === 'ai_generations' ? { ...r, payment_id: null } : mode === 'bare' ? { ...r, active_prompt_template_id: null } : r));
      const { error: writeErr } = await dst.from(table).upsert(clean, { onConflict: CONFLICT[table] ?? 'id' });
      if (writeErr) {
        error = writeErr.message;
        break;
      }
      rows += data.length;
      if (data.length < 500) break;
    }
    if (mode !== 'bare' || error) report.push({ table, rows, ...(error ? { error } : {}) });
  }
  return { from, to: opts.to, report };
}

/** JSON backup of the configuration (no photos, no secrets beyond hashes). */
export async function exportConfig() {
  const supabase = createServerClient();
  const out: Record<string, unknown[]> = {};
  for (const table of CORE_TABLES) {
    if (table === 'admin_users' || table.includes(':')) continue;
    const { data } = await supabase.from(table).select('*').limit(5000);
    out[table] = data ?? [];
  }
  return { exportedAt: new Date().toISOString(), version: 'photovoks-v5', tables: out };
}
