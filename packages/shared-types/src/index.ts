// =============================================================================
// Photovoks — Shared Types
// All domain interfaces and type aliases shared across apps and packages.
// =============================================================================

// ── Geometry ─────────────────────────────────────────────────────────────────

/**
 * Fractional slot geometry relative to the 600×1800 canvas.
 * All values are in the range [0, 1].
 */
export interface SlotGeometry {
  /** Fraction 0-1, left edge */
  x: number;
  /** Fraction 0-1, top edge */
  y: number;
  /** Fraction 0-1, width */
  w: number;
  /** Fraction 0-1, height */
  h: number;
  /** w / h (preserves pixel aspect ratio) */
  aspectRatio: number;
}

// ── Event ─────────────────────────────────────────────────────────────────────

export type EventStatus = 'draft' | 'active' | 'archived';

export interface Event {
  id: string;
  name: string;
  status: EventStatus;
  /** Number of days before session assets are auto-deleted */
  retentionDays: number;
  /** Maximum AI sketch generations per day for this event */
  dailySketchCap: number;
  /** X-offset adjustment (px) from the default 602 px tear line */
  tearLineOffsetPx: number;
  /** FK to prompt_templates.id; null if no template is set */
  activePromptTemplateId: string | null;
}

// ── Frame ─────────────────────────────────────────────────────────────────────

export interface Frame {
  id: string;
  eventId: string;
  name: string;
  /** Path in the 'frames' Supabase Storage bucket */
  storagePath: string;
  /** Ordered array of photo slot geometries (exactly 3 for a strip frame) */
  slotGeometry: SlotGeometry[];
  isActive: boolean;
  sortOrder: number;
}

// ── Session ───────────────────────────────────────────────────────────────────

export type SessionStatus =
  | 'created'
  | 'capturing'
  | 'composed'
  | 'printing'
  | 'printed'
  | 'completed'
  | 'abandoned'
  | 'failed';

// ── Print Job ─────────────────────────────────────────────────────────────────

export type PrintJobStatus =
  | 'queued'
  | 'printing'
  | 'printed'
  | 'failed'
  | 'cancelled'
  | 'cancel_failed';

export interface PrintJob {
  id: string;
  sessionId: string;
  type: 'strip' | 'sketch';
  status: PrintJobStatus;
  /** Path in Supabase Storage; null until asset is prepared */
  assetPath: string | null;
  /** Human-readable failure reason; null on success */
  errorReason: string | null;
}

// ── Sketch Job ────────────────────────────────────────────────────────────────

export type SketchJobStatus =
  | 'pending'
  | 'processing'
  | 'done'
  | 'failed'
  | 'failed_safety';

export interface SketchJob {
  id: string;
  sessionId: string;
  status: SketchJobStatus;
  /** Path to the selected source photo in Storage */
  inputPhotoPath: string | null;
  /** Path to the raw Gemini output in Storage */
  resultPath: string | null;
  /** Path to the composed 600×1800 px print-ready card in Storage */
  cardPath: string | null;
  /** Number of auto-retries attempted (max 1) */
  retryCount: number;
  errorReason: string | null;
}

// ── Live Photo ────────────────────────────────────────────────────────────────

/** MVP: scaffold only — no MediaRecorder implementation */
export type LivePhotoStatus = 'pending' | 'processing' | 'done' | 'failed';

// ── Booth State Machine ───────────────────────────────────────────────────────

export type BoothStep =
  | 'idle'
  | 'consent'
  | 'frames'
  | 'capture'
  | 'preview'
  | 'composing'
  | 'end';

/**
 * Structured error carried in BoothState.
 * Each variant maps to a distinct error screen / recovery path.
 */
export type BoothError =
  | 'camera_permission_denied'
  | 'no_active_frames'
  | 'upload_failed_max_retries'
  | 'confirm_failed'
  | 'unknown';

export interface BoothState {
  step: BoothStep;
  sessionId: string | null;
  sessionToken: string | null;
  selectedFrame: Frame | null;
  /** Length 3; null = not yet captured */
  captures: (Blob | null)[];
  /** Length 3; true once a retake has been used for that slot */
  retakesUsed: boolean[];
  /** 0 | 1 | 2 — index of the photo sent to AI sketch; defaults to 1 */
  selectedPhotoIndex: number;
  /**
   * Pre-composed strip + sheet blobs produced in the background during the
   * preview screen. When set, the composing screen skips recomposition and
   * goes straight to upload — eliminating duplicate canvas work.
   */
  composedStripBlob: Blob | null;
  composedSheetBlob: Blob | null;
  uploadPending: boolean;
  printJobId: string | null;
  printJobStatus: PrintJobStatus | null;
  event: Event | null;
  error: BoothError | null;
}

export type BoothAction =
  | { type: 'RESET' }
  | { type: 'SET_EVENT'; event: Event }
  | { type: 'ACCEPT_CONSENT' }
  | { type: 'DECLINE_CONSENT' }
  | { type: 'SELECT_FRAME'; frame: Frame }
  | { type: 'CAPTURE_PHOTO'; slotIndex: number; blob: Blob }
  | { type: 'USE_RETAKE'; slotIndex: number }
  | { type: 'SET_SKETCH_PHOTO'; index: number }
  | { type: 'CONFIRM_PREVIEW' }
  | { type: 'STORE_COMPOSED_STRIP'; stripBlob: Blob; sheetBlob: Blob }
  | { type: 'UPLOAD_COMPLETE'; printJobId: string; sessionId: string; sessionToken: string }
  | { type: 'UPLOAD_FAILED'; error: Error }
  | { type: 'PRINT_STATUS_UPDATE'; status: PrintJobStatus }
  | { type: 'DISMISS_END_SCREEN' }
  | { type: 'SET_ERROR'; error: BoothError };

// ── Observability ─────────────────────────────────────────────────────────────

export interface LogEntry {
  /** ISO 8601 timestamp */
  ts: string;
  level: 'info' | 'warn' | 'error';
  /** Dot-namespaced event name, e.g. 'session.created', 'print_job.claimed' */
  event: string;
  sessionId?: string;
  jobId?: string;
  details?: Record<string, unknown>;
}

// ── Token ─────────────────────────────────────────────────────────────────────
export { generateSessionToken } from './token';
