/**
 * Runtime settings edited in the developer panel (SERVER ONLY).
 *
 * Stored in `app_settings` (one row per group) and cached per server
 * instance for a few seconds. Every read is tolerant: before migration v5 is
 * applied, or while the database is unreachable, the defaults are used so the
 * site keeps working.
 */
import { createServerClient } from '@/lib/supabase/server';
import { DEFAULT_SETTINGS, mergeSettings, type AppSettings, type SettingsGroup } from './settings-shared';

export { DEFAULT_SETTINGS, type AppSettings, type SettingsGroup } from './settings-shared';

const TTL_MS = 20_000;
let cache: { at: number; value: AppSettings; ok: boolean } | null = null;
let inflight: Promise<AppSettings> | null = null;

async function load(): Promise<AppSettings> {
  try {
    const { data, error } = await createServerClient().from('app_settings').select('key, value');
    if (error) throw error;
    const raw: Record<string, unknown> = {};
    for (const row of data ?? []) raw[row.key as string] = row.value;
    const value = mergeSettings(raw);
    cache = { at: Date.now(), value, ok: true };
    return value;
  } catch {
    // Keep serving the last good copy (or defaults) when the DB hiccups.
    const value = cache?.value ?? DEFAULT_SETTINGS;
    cache = { at: Date.now(), value, ok: false };
    return value;
  }
}

/**
 * Env overrides win over the database. They keep working when the database
 * itself is down or restricted (e.g. Supabase 402 after the quota ran out):
 *   MAINTENANCE_MODE=1      force the maintenance screen
 *   STORAGE_DRIVER=s3       force new uploads to S3/R2
 *   AI_DISABLED=1           force AI off
 *   PAYMENTS_DISABLED=1     make everything free
 */
function withEnv(v: AppSettings): AppSettings {
  const env = process.env;
  if (!env.MAINTENANCE_MODE && !env.STORAGE_DRIVER && !env.AI_DISABLED && !env.PAYMENTS_DISABLED) return v;
  return {
    ...v,
    maintenance: env.MAINTENANCE_MODE === '1' ? { ...v.maintenance, enabled: true } : v.maintenance,
    storage: env.STORAGE_DRIVER === 's3' || env.STORAGE_DRIVER === 'supabase' ? { ...v.storage, driver: env.STORAGE_DRIVER } : v.storage,
    ai: env.AI_DISABLED === '1' ? { enabled: false } : v.ai,
    payments: env.PAYMENTS_DISABLED === '1' ? { ...v.payments, enabled: false } : v.payments,
  };
}

/** Current settings (cached ≤ 20 s). Never throws. */
export async function getSettings(): Promise<AppSettings> {
  if (cache && Date.now() - cache.at < TTL_MS) return withEnv(cache.value);
  if (!inflight) inflight = load().finally(() => (inflight = null));
  return withEnv(await inflight);
}

/** Settings exactly as stored (developer panel editing — without env overrides). */
export async function getStoredSettings(): Promise<AppSettings> {
  if (!cache || Date.now() - cache.at >= TTL_MS) {
    if (!inflight) inflight = load().finally(() => (inflight = null));
    await inflight;
  }
  return cache?.value ?? DEFAULT_SETTINGS;
}

export function envOverrides(): string[] {
  return ['MAINTENANCE_MODE', 'STORAGE_DRIVER', 'AI_DISABLED', 'PAYMENTS_DISABLED'].filter((k) => process.env[k]);
}

/** Whether the last settings read reached the database. */
export function settingsReachable(): boolean {
  return cache?.ok ?? true;
}

/** Writes one settings group (merged over the current value). */
export async function saveSettingsGroup<K extends SettingsGroup>(key: K, value: Partial<AppSettings[K]>): Promise<AppSettings> {
  const current = await getStoredSettings();
  const next = mergeSettings({ ...current, [key]: { ...current[key], ...value } });
  const { error } = await createServerClient()
    .from('app_settings')
    .upsert({ key, value: next[key], updated_at: new Date().toISOString() }, { onConflict: 'key' });
  if (error) throw new Error(error.message.includes('app_settings') ? 'Tabel app_settings belum ada — jalankan migrasi v5.' : error.message);
  cache = { at: Date.now(), value: next, ok: true };
  return next;
}

export function invalidateSettings() {
  cache = null;
}
