/**
 * Runtime settings model + validation. Client-safe (no server imports): the
 * developer panel renders and edits the same shapes.
 */

export type StorageDriverId = 'supabase' | 's3';
export type ImageQuality = 'saver' | 'balanced' | 'high';

export interface AppSettings {
  maintenance: {
    /** Guest-facing pages (booth, QR page, live wall, guestbook) show a maintenance screen. */
    enabled: boolean;
    message: string;
    /** Keep booths running during maintenance (only guest pages are closed). */
    keepBooth: boolean;
  };
  ai: {
    /** Global AI switch — off hides AI everywhere, whatever the event settings say. */
    enabled: boolean;
  };
  payments: {
    /** Global payment switch — off makes every session/AI free. */
    enabled: boolean;
    /** Default AI price for new events (IDR). */
    defaultAiPrice: number;
    /** Minutes a pending payment stays valid. */
    expiryMinutes: number;
    /** QRIS gateway: auto = DOKU if configured, else Aulaa. */
    provider: 'auto' | 'doku' | 'aulaa';
  };
  storage: {
    /** Where NEW files are written. Reads always try every configured driver. */
    driver: StorageDriverId;
    readFallback: boolean;
  };
  performance: {
    /** Saver mode: smaller previews, slower polling, no animated previews in grids. */
    liteMode: boolean;
    livePollSeconds: number;
    printPollSeconds: number;
    imageQuality: ImageQuality;
  };
  fun: {
    /** Low-poly animals photobomb the booth photos (baked into the frame). */
    lowPoly: boolean;
    /** Guests can pick a meme look (Freaky tiw / Tes SWAG) in review. */
    meme: boolean;
  };
  quota: {
    /** Monthly egress budget of the storage plan, in GB (Supabase free = 5). */
    egressGb: number;
    warnPercent: number;
  };
}

export type SettingsGroup = keyof AppSettings;

export const DEFAULT_SETTINGS: AppSettings = {
  maintenance: { enabled: false, message: 'Photovoks sedang dirawat sebentar. Coba lagi beberapa menit lagi ya!', keepBooth: true },
  ai: { enabled: true },
  payments: { enabled: true, defaultAiPrice: 1500, expiryMinutes: 15, provider: 'auto' },
  storage: { driver: 'supabase', readFallback: true },
  performance: { liteMode: false, livePollSeconds: 8, printPollSeconds: 5, imageQuality: 'balanced' },
  fun: { lowPoly: true, meme: true },
  quota: { egressGb: 5, warnPercent: 80 },
};

const bool = (v: unknown, d: boolean) => (typeof v === 'boolean' ? v : d);
const num = (v: unknown, d: number, min: number, max: number) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v))) : d;
const text = (v: unknown, d: string, max: number) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : d);
const pick = <T extends string>(v: unknown, list: readonly T[], d: T): T => (typeof v === 'string' && (list as readonly string[]).includes(v) ? (v as T) : d);

/** Merges raw (possibly partial / invalid) JSON over the defaults. */
export function mergeSettings(raw: Record<string, unknown>): AppSettings {
  const g = (k: SettingsGroup) => (raw[k] && typeof raw[k] === 'object' ? (raw[k] as Record<string, unknown>) : {});
  const d = DEFAULT_SETTINGS;
  const m = g('maintenance');
  const a = g('ai');
  const p = g('payments');
  const s = g('storage');
  const f = g('performance');
  const q = g('quota');
  const fn = g('fun');
  return {
    maintenance: { enabled: bool(m.enabled, d.maintenance.enabled), message: text(m.message, d.maintenance.message, 300), keepBooth: bool(m.keepBooth, d.maintenance.keepBooth) },
    ai: { enabled: bool(a.enabled, d.ai.enabled) },
    payments: {
      enabled: bool(p.enabled, d.payments.enabled),
      defaultAiPrice: num(p.defaultAiPrice, d.payments.defaultAiPrice, 0, 1_000_000),
      expiryMinutes: num(p.expiryMinutes, d.payments.expiryMinutes, 3, 120),
      provider: pick(p.provider, ['auto', 'doku', 'aulaa'] as const, d.payments.provider),
    },
    storage: { driver: pick(s.driver, ['supabase', 's3'] as const, d.storage.driver), readFallback: bool(s.readFallback, d.storage.readFallback) },
    performance: {
      liteMode: bool(f.liteMode, d.performance.liteMode),
      livePollSeconds: num(f.livePollSeconds, d.performance.livePollSeconds, 3, 120),
      printPollSeconds: num(f.printPollSeconds, d.performance.printPollSeconds, 2, 60),
      imageQuality: pick(f.imageQuality, ['saver', 'balanced', 'high'] as const, d.performance.imageQuality),
    },
    fun: { lowPoly: bool(fn.lowPoly, d.fun.lowPoly), meme: bool(fn.meme, d.fun.meme) },
    quota: { egressGb: num(q.egressGb, d.quota.egressGb, 1, 100_000), warnPercent: num(q.warnPercent, d.quota.warnPercent, 10, 100) },
  };
}

/** Rupiah formatting used across booth, guest page and portals. */
export function formatRupiah(n: number): string {
  return `Rp ${Math.round(n).toLocaleString('id-ID')}`;
}
