/**
 * Event model shared by server routes and client components.
 * (No server-only imports here — safe for client bundles.)
 */

export type EventStatus = 'draft' | 'active' | 'archived';
export type CaptureMode = 'auto' | 'manual';
export type PrintMode = 'off' | 'browser' | 'station';
export type GalleryVisibility = 'private' | 'unlisted' | 'public';

export interface EventConfig {
  id: string;
  code: string;
  name: string;
  status: EventStatus;
  description: string | null;
  welcomeTitle: string | null;
  welcomeSubtitle: string | null;
  hasPin: boolean;
  retentionDays: number;
  shotCount: number;
  countdownSeconds: number;
  captureMode: CaptureMode;
  allowRetake: boolean;
  maxRetakes: number;
  livePhoto: boolean;
  mirrorPreview: boolean;
  filters: string[];
  printMode: PrintMode;
  printPaper: string;
  printCopies: number;
  maxGuestPrints: number;
  aiEnabled: boolean;
  aiStyles: string[];
  aiPerSession: number;
  dailySketchCap: number;
  galleryVisibility: GalleryVisibility;
  galleryToken: string;
  activePromptTemplateId: string | null;
  createdAt: string;
}

/** Columns selected for an EventConfig. Never includes pin_hash. */
export const EVENT_COLUMNS =
  'id, code, name, status, description, welcome_title, welcome_subtitle, pin_hash, retention_days, ' +
  'shot_count, countdown_seconds, capture_mode, allow_retake, max_retakes, live_photo, mirror_preview, filters, ' +
  'print_mode, print_paper, print_copies, max_guest_prints, ai_enabled, ai_styles, ai_per_session, daily_sketch_cap, ' +
  'gallery_visibility, gallery_token, active_prompt_template_id, created_at';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mapEvent(row: any): EventConfig {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    status: row.status,
    description: row.description ?? null,
    welcomeTitle: row.welcome_title ?? null,
    welcomeSubtitle: row.welcome_subtitle ?? null,
    hasPin: Boolean(row.pin_hash),
    retentionDays: row.retention_days ?? 30,
    shotCount: row.shot_count ?? 3,
    countdownSeconds: row.countdown_seconds ?? 3,
    captureMode: row.capture_mode ?? 'auto',
    allowRetake: row.allow_retake ?? true,
    maxRetakes: row.max_retakes ?? 2,
    livePhoto: row.live_photo ?? true,
    mirrorPreview: row.mirror_preview ?? true,
    filters: row.filters ?? ['original'],
    printMode: row.print_mode ?? 'station',
    printPaper: row.print_paper ?? '4x6',
    printCopies: row.print_copies ?? 1,
    maxGuestPrints: row.max_guest_prints ?? 2,
    aiEnabled: row.ai_enabled ?? true,
    aiStyles: row.ai_styles ?? [],
    aiPerSession: row.ai_per_session ?? 3,
    dailySketchCap: row.daily_sketch_cap ?? 50,
    galleryVisibility: row.gallery_visibility ?? 'private',
    galleryToken: row.gallery_token ?? '',
    activePromptTemplateId: row.active_prompt_template_id ?? null,
    createdAt: row.created_at,
  };
}

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I

export function generateEventCode(length = 6): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
}

export function normalizeEventCode(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const code = value.trim().toUpperCase();
  return /^[A-Z0-9]{4,12}$/.test(code) ? code : null;
}

export function isValidEventPin(pin: unknown): pin is string {
  return typeof pin === 'string' && /^\d{4,8}$/.test(pin);
}

/** Field-level validation for event updates coming from forms. */
export interface EventUpdateInput {
  name?: string;
  description?: string | null;
  welcomeTitle?: string | null;
  welcomeSubtitle?: string | null;
  status?: EventStatus;
  retentionDays?: number;
  shotCount?: number;
  countdownSeconds?: number;
  captureMode?: CaptureMode;
  allowRetake?: boolean;
  maxRetakes?: number;
  livePhoto?: boolean;
  mirrorPreview?: boolean;
  filters?: string[];
  printMode?: PrintMode;
  printPaper?: string;
  printCopies?: number;
  maxGuestPrints?: number;
  aiEnabled?: boolean;
  aiStyles?: string[];
  aiPerSession?: number;
  dailySketchCap?: number;
  galleryVisibility?: GalleryVisibility;
}

type Validator = (v: unknown) => unknown | undefined;

const str = (max: number, nullable = false): Validator => (v) => {
  if (v === null && nullable) return null;
  if (typeof v !== 'string') return undefined;
  const t = v.trim().slice(0, max);
  if (!t) return nullable ? null : undefined;
  return t;
};
const int = (min: number, max: number): Validator => (v) =>
  typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max ? v : undefined;
const bool: Validator = (v) => (typeof v === 'boolean' ? v : undefined);
const oneOf = (values: readonly string[]): Validator => (v) =>
  typeof v === 'string' && values.includes(v) ? v : undefined;
const strList = (max: number): Validator => (v) =>
  Array.isArray(v) && v.every((x) => typeof x === 'string' && /^[a-z0-9_-]{1,40}$/.test(x))
    ? Array.from(new Set(v as string[])).slice(0, max)
    : undefined;

const FIELDS: Record<keyof EventUpdateInput, [column: string, validate: Validator]> = {
  name: ['name', str(80)],
  description: ['description', str(500, true)],
  welcomeTitle: ['welcome_title', str(80, true)],
  welcomeSubtitle: ['welcome_subtitle', str(160, true)],
  status: ['status', oneOf(['draft', 'active', 'archived'])],
  retentionDays: ['retention_days', int(1, 365)],
  shotCount: ['shot_count', int(1, 8)],
  countdownSeconds: ['countdown_seconds', int(1, 10)],
  captureMode: ['capture_mode', oneOf(['auto', 'manual'])],
  allowRetake: ['allow_retake', bool],
  maxRetakes: ['max_retakes', int(0, 10)],
  livePhoto: ['live_photo', bool],
  mirrorPreview: ['mirror_preview', bool],
  filters: ['filters', strList(12)],
  printMode: ['print_mode', oneOf(['off', 'browser', 'station'])],
  printPaper: ['print_paper', (v) => (typeof v === 'string' && /^[a-z0-9x_-]{1,20}$/i.test(v) ? v : undefined)],
  printCopies: ['print_copies', int(1, 10)],
  maxGuestPrints: ['max_guest_prints', int(0, 20)],
  aiEnabled: ['ai_enabled', bool],
  aiStyles: ['ai_styles', strList(20)],
  aiPerSession: ['ai_per_session', int(0, 10)],
  dailySketchCap: ['daily_sketch_cap', int(0, 10000)],
  galleryVisibility: ['gallery_visibility', oneOf(['private', 'unlisted', 'public'])],
};

/**
 * Converts a (partial) camelCase body into DB columns.
 * Returns { update } or { error } naming the first invalid field.
 */
export function buildEventUpdate(
  body: Record<string, unknown>,
): { update: Record<string, unknown> } | { error: string } {
  const update: Record<string, unknown> = {};
  for (const [key, [column, validate]] of Object.entries(FIELDS)) {
    if (!(key in body)) continue;
    const value = validate(body[key]);
    if (value === undefined) return { error: `Nilai tidak valid: ${key}` };
    update[column] = value;
  }
  return { update };
}
