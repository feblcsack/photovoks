# Design Document — Photovoks Photobooth

## Overview

Photovoks is a photobooth platform for paid rental events. It consists of three primary application surfaces: a Next.js web app (booth iPad UI, visitor session page, and admin panel), a Supabase backend (Postgres, Storage, Realtime, Auth), and an Electron print station desktop app. An AI sketch generation pipeline runs as a Vercel background route triggered via Supabase database webhooks.

The design targets the confirmed monorepo structure:

```
photovoks/
├── apps/
│   ├── web/          # Next.js App Router (booth, session page, admin)
│   └── print-station/ # Electron app
├── packages/
│   └── shared-types/  # Shared TypeScript types
└── supabase/
    └── migrations/    # SQL migration files
```

---

## Architecture

### System Context

```
                       ┌─────────────────────────────────────────┐
                       │           Supabase Cloud                │
                       │  ┌──────────┐  ┌──────┐  ┌──────────┐  │
                       │  │ Postgres │  │ Auth │  │ Storage  │  │
                       │  │  + RLS   │  │      │  │(private) │  │
                       │  └──────────┘  └──────┘  └──────────┘  │
                       │        │           │           │        │
                       │        └───────────┴───────────┘        │
                       │             Realtime                    │
                       └───────────────┬─────────────────────────┘
                                       │
         ┌─────────────────────────────┼────────────────────────────────┐
         │                             │                                │
         ▼                             ▼                                ▼
┌─────────────────┐          ┌──────────────────┐            ┌──────────────────┐
│  iPad Browser   │          │  Vercel (Next.js) │            │  Print Station   │
│  Booth UI       │◄────────►│  API Routes       │◄──────────►│  (Electron)      │
│  Session Page   │  HTTPS   │  Sketch Worker    │  Realtime  │  macOS / Windows │
│  Admin Panel    │          │  Admin Routes     │  + REST    │  CUPS / Sumatra  │
└─────────────────┘          └──────┬────────────┘            └──────────────────┘
                                    │ Server-side
                                    ▼
                            ┌──────────────┐
                            │  Gemini API  │
                            └──────────────┘
```

### Request Flow — Booth Session (Happy Path)

1. Visitor taps idle screen → `POST /api/sessions` (creates record, returns signed upload URLs)
2. Visitor consents, selects frame, captures 3 photos
3. Client composes strip + sheet on Canvas
4. Client uploads 5 assets directly to Supabase Storage via signed URLs (no Vercel routing)
5. Client calls `POST /api/sessions/[id]/confirm` → creates print job + enqueues sketch job
6. Print station claims job via Realtime, downloads sheet, prints via PrintDriver
7. Realtime pushes job status to booth end screen
8. Supabase webhook triggers `POST /api/sketch/process` → Gemini generates sketch → result stored

---

## Components

### 1. Booth Flow (`apps/web/app/(booth)/`)

A single-page stateful React application rendered within the Next.js App Router's `(booth)` route group. State is managed with React context + `useReducer` so the entire session's in-memory state (current route step, captured photos, selected frame, retake usage) lives in one place and can be cleared atomically on reset.

**Route steps (client-side state machine, not URL changes mid-session):**

```
idle → consent → frames → capture → preview → composing → end
```

Each step corresponds to a `(booth)` sub-route rendered via shallow navigation so the URL reflects the step but browser history is not polluted.

**BoothState shape:**

```typescript
// packages/shared-types/src/booth.ts
type BoothStep =
  | 'idle' | 'consent' | 'frames' | 'capture'
  | 'preview' | 'composing' | 'end';

interface BoothState {
  step: BoothStep;
  sessionId: string | null;
  sessionToken: string | null;
  selectedFrame: Frame | null;
  captures: (Blob | null)[];        // length 3, null = not yet captured
  retakesUsed: boolean[];            // length 3
  selectedPhotoIndex: number;        // 0 | 1 | 2, default 1
  uploadPending: boolean;
  printJobId: string | null;
  printJobStatus: PrintJobStatus | null;
  event: Event | null;
  error: BoothError | null;
}

type BoothAction =
  | { type: 'RESET' }
  | { type: 'SET_EVENT'; event: Event }
  | { type: 'ACCEPT_CONSENT' }
  | { type: 'DECLINE_CONSENT' }
  | { type: 'SELECT_FRAME'; frame: Frame }
  | { type: 'CAPTURE_PHOTO'; slotIndex: number; blob: Blob }
  | { type: 'USE_RETAKE'; slotIndex: number }
  | { type: 'SET_SKETCH_PHOTO'; index: number }
  | { type: 'CONFIRM_PREVIEW' }
  | { type: 'UPLOAD_COMPLETE'; printJobId: string }
  | { type: 'UPLOAD_FAILED'; error: Error }
  | { type: 'PRINT_STATUS_UPDATE'; status: PrintJobStatus }
  | { type: 'DISMISS_END_SCREEN' }
  | { type: 'SET_ERROR'; error: BoothError };
```

**Idle timeout:** A `useIdleTimer` hook monitors `pointermove`, `pointerdown`, and `keydown` events. After 60 s of inactivity it dispatches `RESET`. The timer is reset on every interaction.

**Admin gesture:** A `useAdminGesture` hook counts taps in the top-right quadrant (x > 80%, y < 20% of viewport). Five taps within 3 s dispatch navigation to `/admin/pin`.

### 2. Camera Module (`apps/web/lib/camera/`)

```typescript
// camera/index.ts
async function startCamera(constraints: CameraConstraints): Promise<MediaStream>
async function captureFrame(video: HTMLVideoElement): Promise<Blob>
function stopCamera(stream: MediaStream): void
```

`captureFrame` draws the current video frame onto an off-screen `OffscreenCanvas` (or regular Canvas if unavailable) cropped to the slot's aspect ratio, returning a Blob. The crop guide overlay is a transparent `<div>` or `<canvas>` positioned over the video element using the slot's fractional geometry multiplied by the video element's rendered dimensions.

### 3. Canvas Composition (`apps/web/lib/canvas/`)

All composition runs client-side on the iPad.

```typescript
// canvas/compose.ts

/**
 * Composite three photo blobs into a frame PNG.
 * Output: 600×1800 px PNG Blob.
 */
export async function composeStrip(
  photos: Blob[],           // exactly 3
  frameImageBlob: Blob,     // 600×1800 PNG with alpha
  geometry: SlotGeometry[]  // exactly 3 slots, fractions 0-1
): Promise<Blob>

/**
 * Place two strip instances side-by-side for 4R printing.
 * Output: ~1205×1795 px JPEG Blob (quality ≥ 0.9).
 */
export async function composeSheet(
  strip: Blob,
  tearLineOffsetPx: number  // fine-tune from 602 px default
): Promise<Blob>

/**
 * Compose a print-ready sketch card.
 * Output: 600×1800 px PNG Blob (same dimensions as strip).
 */
export async function composeSketchCard(
  sketchBlob: Blob
): Promise<Blob>

/**
 * Compose sketch sheet for printing (left half = sketch, right half = white).
 * Output: ~1205×1795 px JPEG Blob.
 */
export async function composeSketchSheet(
  sketchCard: Blob,
  tearLineOffsetPx: number
): Promise<Blob>
```

`composeStrip` implementation:
1. Create `OffscreenCanvas(600, 1800)`.
2. For each slot `i`, draw `photos[i]` scaled to fit `(slot.x * 600, slot.y * 1800, slot.w * 600, slot.h * 1800)`.
3. Draw `frameImageBlob` on top at full 600×1800.
4. Return `canvas.convertToBlob({ type: 'image/png' })`.

`composeSheet` implementation:
1. Create `OffscreenCanvas(1205, 1795)`.
2. Draw strip at (0, 0) and again at (602 + tearLineOffsetPx, 0).
3. Return `canvas.convertToBlob({ type: 'image/jpeg', quality: 0.92 })`.

### 4. Offline / Resilience (`apps/web/lib/offline/`)

```typescript
// offline/queue.ts
interface PendingEntry {
  id: string;           // uuid
  type: 'session' | 'upload' | 'confirm';
  payload: unknown;
  sessionId: string;
  retries: number;
  createdAt: number;    // epoch ms
}

async function enqueue(entry: Omit<PendingEntry, 'id' | 'createdAt'>): Promise<void>
async function flush(): Promise<void>   // FIFO, session entries first
async function getAll(): Promise<PendingEntry[]>
async function remove(id: string): Promise<void>
```

**IndexedDB store:** `photovoks_pending_queue`, object store `pending_queue` with keyPath `id`.

**Capacity:** Max 50 entries. On `enqueue` when at capacity, the oldest entry (lowest `createdAt`) is evicted via FIFO.

**Flush strategy:**
1. Sort entries: `session` type first, then `upload`, then `confirm`.
2. Process sequentially; on failure apply backoff: `2000 * 2^retries` ms, `retries` cap at 4 (max 5 attempts total).
3. On max retries exceeded, remove entry and log structured error.

**Online detection:** `window.addEventListener('online', flush)` in the service worker and main app shell.

### 5. Session Page (`apps/web/app/s/[token]/`)

A Next.js server component fetches session data at request time via `GET /api/sessions/[token]/status`. The response includes session, sketch job, and print job status. A client component subscribes to Realtime for live updates.

```typescript
// app/s/[token]/page.tsx (Server Component)
export default async function SessionPage({ params }: { params: { token: string } }) {
  const data = await fetchSessionStatus(params.token); // throws notFound() on 404
  return <SessionView initialData={data} token={params.token} />;
}

// components/session/SessionView.tsx (Client Component)
// Subscribes to Realtime channel: session:{sessionId}
// Updates sketch_job_status, live_photo_status, print_job_status reactively
```

**Heartbeat-gated print button:** The "Request Print" button computes `isStationOnline = (Date.now() - lastHeartbeatMs) < 90_000`. This value is refreshed every 30 s via a `setInterval` polling `GET /api/admin/status` for the print station heartbeat.

### 6. Admin Interface (`apps/web/app/admin/`)

Protected via Supabase Auth JWT. The `/api/admin/verify-pin` route validates the PIN server-side against the bcrypt hash in `admin_users`, issues a Supabase Auth JWT on success, and increments `failed_attempts` on failure.

**Frame Slot Geometry Editor:**

```typescript
// components/admin/SlotGeometryEditor.tsx
interface PixelSlot {
  x: number; y: number; w: number; h: number; // pixels, relative to 600×1800
}

function pixelToFraction(slot: PixelSlot): SlotGeometry {
  return {
    x: slot.x / 600,
    y: slot.y / 1800,
    w: slot.w / 600,
    h: slot.h / 1800,
    aspectRatio: (slot.w / 600) / (slot.h / 1800), // = w/h (pixel ratio preserved)
  };
}
```

A `<canvas>` or `<div>` overlay renders coloured transparent rectangles at the fractional positions over a thumbnail of the frame PNG. Updates on every keystroke with no debounce (inputs are numeric, fast re-render is acceptable).

### 7. API Routes (`apps/web/app/api/`)

#### `POST /api/sessions`

```typescript
// Input: { eventId: string }
// Auth: none (public booth endpoint, rate-limited by IP via Vercel edge middleware)
// 1. Validate eventId references an active event
// 2. Generate session token: crypto.getRandomValues(12 bytes) → base64url
// 3. INSERT sessions record (status = 'created', expires_at = now + 24h)
// 4. Generate 5 signed upload URLs (3 photos + strip + sheet), expiry = 10 min
//    Path pattern: sessions/{sessionId}/{filename}
// 5. Return { sessionId, sessionToken, uploadUrls: { photo0, photo1, photo2, strip, sheet } }
```

#### `POST /api/sessions/[id]/confirm`

```typescript
// Auth: session token in Authorization header (Bearer {token})
// 1. Validate token matches session id
// 2. Verify all 5 uploads completed (check Supabase Storage HEAD)
// 3. Upsert print_jobs record (type='strip', status='queued') — idempotent via unique (session_id, type)
// 4. Upsert sketch_jobs record (status='pending') — idempotent via UNIQUE(session_id)
// 5. Update sessions.status → 'composed'
// 6. Return { printJobId, sketchJobId }
```

#### `GET /api/sessions/[token]/status`

```typescript
// Auth: token in URL (unguessable, acts as bearer)
// Returns: { session, sketckJob, printJob, printStationOnline }
// printStationOnline = last heartbeat < 90s ago
// 404 with generic message if token not found
```

#### `GET /api/print-jobs` + `PATCH /api/print-jobs/[id]`

```typescript
// Auth: print station scoped anon key + RLS
// GET: returns jobs with status='queued'
// PATCH: update status, error_reason (print station calls this)
```

#### `POST /api/print-jobs/sketch`

```typescript
// Auth: session token
// Upsert sketch print job (type='sketch') — idempotent
// Validates: sketch job status = 'done', station online
// Returns: { printJobId }
```

#### `POST /api/sketch/process`

```typescript
// Auth: Supabase webhook secret in header
// maxDuration: 60 (Vercel)
// 1. Parse sketch_job id from webhook payload
// 2. Check daily cap: SELECT count(*) WHERE event_id = ? AND date = today AND status = 'done'
// 3. Transition status pending → processing (optimistic lock)
// 4. Read prompt template for event
// 5. Call Gemini API (model from GEMINI_MODEL_NAME)
// 6. On success: upload sketch, compose 600×1800 card, update status → done
// 7. On 429 or timeout: retry once after delay, then → failed
// 8. On safety filter: → failed_safety
// 9. Log structured JSON for all outcomes
```

### 8. Sketch Worker — Server-side Canvas Composition

The sketch card composition runs in the Vercel route (Node.js environment). Uses the `canvas` npm package (node-canvas) for server-side `Canvas` operations since `OffscreenCanvas` is browser-only.

```typescript
// apps/web/lib/canvas/server-compose.ts
import { createCanvas, loadImage } from 'canvas';

export async function composeSketchCardServer(sketchBuffer: Buffer): Promise<Buffer>
export async function composeSketchSheetServer(
  cardBuffer: Buffer,
  tearLineOffsetPx: number
): Promise<Buffer>
```

### 9. Print Station (`apps/print-station/`)

**Main process responsibilities:**
- Supabase client (service role key scoped to print jobs + heartbeat)
- Realtime subscription to `print_jobs` table filtered by `status=eq.queued`
- Polling fallback: every 10 s if Realtime connection is dropped
- Heartbeat `INSERT/UPSERT` to `print_station_heartbeat` every 30 s
- Job processor: claim → download → print → update status
- Local SQLite (`better-sqlite3`) job queue backup
- IPC to renderer for UI updates

**Job processor — atomic claim:**

```typescript
// main/job-processor.ts
async function claimJob(jobId: string): Promise<boolean> {
  // UPDATE print_jobs SET status='printing', updated_at=now()
  // WHERE id = jobId AND status = 'queued'
  // Returns true only if rowCount = 1 (atomic, prevents double-claim)
}
```

**PrintDriver interface:**

```typescript
// drivers/interface.ts
interface PrintOptions {
  copies?: number;
  orientation?: 'portrait' | 'landscape';
}

interface PrintDriver {
  isAvailable(): Promise<boolean>;
  listPrinters(): Promise<string[]>;
  print(filePath: string, printerName: string, options?: PrintOptions): Promise<void>;
  detectError(output: string): PrintError | null;
}

type PrintError =
  | { type: 'paper_out' }
  | { type: 'ink_out' }
  | { type: 'paper_jam' }
  | { type: 'offline' }
  | { type: 'unknown'; message: string };
```

**CupsPrintDriver (macOS):**

```typescript
// drivers/cups.ts
// Executes: lp -d {printerName} -o media=4x6 -o fit-to-page {filePath}
// Parses stderr for error keywords: "paper-out", "jam", "ink"
```

**SumatraPrintDriver (Windows):**

```typescript
// drivers/sumatra.ts
// Executes: SumatraPDF.exe -print-to {printerName} -print-settings "fit,paper=4x6" {filePath}
// Parses exit code and stderr for error states
```

**Driver auto-detection:**

```typescript
const driver: PrintDriver =
  process.platform === 'darwin' ? new CupsPrintDriver() : new SumatraPrintDriver();
```

**Error handling state machine:**

```
queued → printing → printed        (success)
       → failed                    (permanent: jam, max retries)
       → queued                    (transient recovered: paper-out resolved, ink resolved)
```

**Jam handling:** Detected via `detectError(output).type === 'paper_jam'` → status `failed`, `error_reason = 'paper_jam'`. No auto-retry. Operator must use admin "Reprint" action.

**Reconnection backoff:** Supabase Realtime client's built-in reconnection with exponential backoff. The main process additionally monitors the channel state and re-subscribes if the client-level reconnect fails after 5 attempts, with backoff: `Math.min(2000 * 2 ** attempt, 60000)` ms.

**Local SQLite schema:**

```sql
CREATE TABLE local_jobs (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  type TEXT NOT NULL,
  status TEXT NOT NULL,
  asset_path TEXT,
  error_reason TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
```

**Renderer process:** React + IPC. Displays job list (recent 20), current printer status, station online/offline indicator, and manual reprint button. Uses `ipcRenderer.on('job-update', ...)` for live updates from main.

### 10. Session Token Generation

```typescript
// packages/shared-types/src/token.ts (also used in apps/web/lib/)
export function generateSessionToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12)); // 96 bits
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}
```

96 bits of entropy from `crypto.getRandomValues` ensures tokens are unguessable. The output is a 16-character URL-safe base64url string stored in `sessions.token` with a `UNIQUE` index.

### 11. Service Worker (`apps/web/public/sw.js`)

**Cache strategy:** Cache-first for booth UI shell, frame images, fonts. Network-first for API calls.

**Precache manifest** (injected by Workbox at build time):
- `/_next/static/**` — JS, CSS bundles
- `/fonts/**` — Caveat, Inter
- `/frames/**` — Active frame PNGs (fetched on booth start and cached with event-keyed cache name)

**Online detection → flush:**

```javascript
self.addEventListener('message', (event) => {
  if (event.data === 'FLUSH_QUEUE') flushIndexedDB();
});
self.addEventListener('online', () => flushIndexedDB()); // not reliable in SW; main app also triggers
```

### 12. Retention / Deletion Job

A Supabase Edge Function or scheduled Postgres function runs daily.

```sql
-- Identify expired sessions safe to delete (no active print jobs)
SELECT s.id, s.strip_url, s.sheet_url
FROM sessions s
WHERE s.expires_at < now()
  AND NOT EXISTS (
    SELECT 1 FROM print_jobs pj
    WHERE pj.session_id = s.id
      AND pj.status IN ('queued', 'printing')
  );
```

For each candidate:
1. DELETE storage objects (via Supabase Storage API): `sessions/{id}/**`, `sketches/{id}/**`
2. Only if all storage deletes succeed: DELETE session record (cascades to print_jobs, sketch_jobs via FK)

### 13. i18n (`apps/web/i18n/id.ts`)

```typescript
// All Booth + Session Page UI strings in Bahasa Indonesia
export const id = {
  idle: {
    tapToStart: 'Ketuk untuk mulai',
    // ...
  },
  consent: {
    title: 'Persetujuan Penggunaan Foto',
    retentionNotice: (days: number) => `Foto Anda akan dihapus otomatis setelah ${days} hari.`,
    accept: 'Saya Setuju',
    decline: 'Tidak',
  },
  frames: {
    title: 'Pilih Bingkai',
    noFrames: 'Tidak ada bingkai tersedia.',
    returnToIdle: 'Kembali ke Awal',
  },
  capture: {
    retake: 'Foto Ulang',
    next: 'Berikutnya',
  },
  preview: {
    title: 'Pratinjau Strip',
    confirm: 'Cetak',
    back: 'Kembali',
  },
  end: {
    printing: 'Sedang mencetak…',
    printed: 'Cetak selesai!',
    done: 'Selesai',
    uploadPending: 'Unggahan masih berlangsung…',
    noRealtime: 'Status cetak tidak dapat dikonfirmasi.',
  },
  offline: {
    indicator: 'Tidak ada koneksi internet',
  },
  errors: {
    generic: 'Terjadi kesalahan.',
    returnToIdle: 'Kembali ke Awal',
  },
} as const;

export type I18n = typeof id;
```

---

## Data Models

All shared types live in `packages/shared-types/src/`.

```typescript
// packages/shared-types/src/index.ts

export interface SlotGeometry {
  x: number;        // fraction 0-1, left edge
  y: number;        // fraction 0-1, top edge
  w: number;        // fraction 0-1, width
  h: number;        // fraction 0-1, height
  aspectRatio: number; // w / h (pixel ratio)
}

export type EventStatus = 'draft' | 'active' | 'archived';

export interface Event {
  id: string;
  name: string;
  status: EventStatus;
  retentionDays: number;
  dailySketchCap: number;
  tearLineOffsetPx: number;
  activePromptTemplateId: string | null;
}

export interface Frame {
  id: string;
  eventId: string;
  name: string;
  storagePath: string;
  slotGeometry: SlotGeometry[];
  isActive: boolean;
  sortOrder: number;
}

export type SessionStatus =
  | 'created' | 'capturing' | 'composed'
  | 'printing' | 'printed' | 'completed'
  | 'abandoned' | 'failed';

export type PrintJobStatus =
  | 'queued' | 'printing' | 'printed'
  | 'failed' | 'cancelled' | 'cancel_failed';

export type SketchJobStatus =
  | 'pending' | 'processing' | 'done'
  | 'failed' | 'failed_safety';

export type LivePhotoStatus = 'pending' | 'processing' | 'done' | 'failed';

export interface PrintJob {
  id: string;
  sessionId: string;
  type: 'strip' | 'sketch';
  status: PrintJobStatus;
  assetPath: string | null;
  errorReason: string | null;
}

export interface SketchJob {
  id: string;
  sessionId: string;
  status: SketchJobStatus;
  inputPhotoPath: string | null;
  resultPath: string | null;
  cardPath: string | null;
  retryCount: number;
  errorReason: string | null;
}
```

---

## Error Handling

### Booth

| Scenario | Behaviour |
|---|---|
| No active frames for event | Error screen with "Kembali ke Awal" CTA |
| Camera permission denied | Error screen with instructions, "Kembali ke Awal" |
| Upload failure (network) | Enqueue to IndexedDB, show offline indicator, retry |
| Upload failure (max retries) | Error screen with session QR code still visible, "Hubungi petugas" |
| Confirm API failure | Retry once immediately, then error screen |
| Any unhandled exception in step | `BoothError` dispatched → error step rendered with recovery CTA |
| Realtime unavailable on end screen | Fallback message + 45 s timeout |

### Print Station

| Scenario | Behaviour |
|---|---|
| Realtime disconnected | Polling fallback every 10 s; exponential backoff reconnect |
| Claim race (two stations) | Atomic UPDATE WHERE status='queued'; only one succeeds |
| Paper out | Retain job (not failed), log error, wait for resolution event |
| Paper jam | Status → failed, error_reason = 'paper_jam', no auto-retry |
| Asset download failure | Retry 3× with backoff; then failed |
| Printer offline | Log error, retain job, retry on next poll cycle |

### Sketch Worker

| Scenario | Behaviour |
|---|---|
| Daily cap reached | status → failed (no Gemini call), log `daily_cap_reached` |
| Gemini 429 | Retry once (delay 2 s), then failed |
| Gemini timeout (>55 s) | Mark failed immediately (preserve Vercel 60 s budget) |
| Safety filter triggered | status → failed_safety (not retried) |
| Storage upload failure | Mark failed, log error |
| Duplicate webhook trigger | UNIQUE(session_id) on sketch_jobs prevents duplicate processing |

### Session Page

| Scenario | Behaviour |
|---|---|
| Invalid / expired token | Generic 404 page, no data leaked |
| Sketch failed/failed_safety | Sketch section hidden, neutral message |
| Live photo failed | Live photo section hidden, neutral message |
| Print station offline (>90 s) | "Request Print" button disabled |
| Realtime unavailable | Status polling fallback every 15 s |

---

## Security Design

- **Session tokens:** 96-bit entropy via `crypto.getRandomValues`, base64url, stored in `sessions.token` (unique index). Tokens are transmitted over HTTPS only.
- **API authentication:** Every write API route validates the session token server-side against the DB before performing any mutation. No anonymous direct DB writes from the client.
- **Upload URLs:** Supabase signed upload URLs with 10-minute expiry, scoped to `sessions/{sessionId}/` path. Uploads go directly from the iPad to Supabase Storage, bypassing Vercel (no 4.5 MB body limit concern).
- **Service role key:** Used only in Next.js API routes and the sketch worker (server-side). Never included in the client bundle. Verified by `NEXT_PUBLIC_` prefix convention (service role key must not use this prefix).
- **Gemini API key:** Server-side only, same constraints.
- **Admin PIN:** bcrypt-hashed in `admin_users.pin_hash`. Never returned to the client. Rate-limited to 5 attempts before 5-minute lockout.
- **Admin JWT:** Supabase Auth token, 10-minute validity. Auto-logout on inactivity enforced client-side with a `useActivityTimer` hook that calls `supabase.auth.signOut()`.
- **RLS:** All tables have RLS enabled. Print station uses a scoped anon key with narrow policies (read/update `print_jobs`, upsert `print_station_heartbeat`).
- **Private Storage buckets:** All buckets set to non-public. Assets served exclusively via Supabase signed URLs (time-limited).

---

## Visual Style Implementation

CSS custom properties defined in `apps/web/app/globals.css`:

```css
:root {
  --color-bg: #FDFAF3;
  --color-accent: #E85D26;
  --color-ink: #1A1A1A;
  --font-display: 'Caveat', cursive;
  --font-body: 'Inter', sans-serif;
  --border-radius-doodle: 4px;
}

@media (prefers-reduced-motion: reduce) {
  .wobble, .bounce, [data-animate] {
    animation: none !important;
    transition: none !important;
  }
}
```

Doodle UI primitive components (`components/doodle/`):
- `DoodleButton` — `<button>` with SVG border, Caveat font label, wobble animation
- `DoodleCard` — `<div>` with hand-drawn SVG border overlay
- `DoodleBorder` — standalone SVG border component for arbitrary wrappers

These components are used exclusively in the booth flow, session page, and idle screen. Admin screens and camera preview use standard, unstyled components.

---

## Observability

All structured log entries use this base shape:

```typescript
interface LogEntry {
  ts: string;        // ISO 8601
  level: 'info' | 'warn' | 'error';
  event: string;     // e.g. 'session.created', 'print_job.claimed'
  sessionId?: string;
  jobId?: string;
  details?: Record<string, unknown>;
}
```

Logged via `console.log(JSON.stringify(entry))` on Vercel (captured by Vercel log drain) and to a local file on the print station (via `electron-log`).

---

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

**Property reflection notes:** After reviewing all prework-identified properties, the following consolidations were applied:
- 4.6 and 4.7 (retake lock) → merged into Property 7
- 10.4 and 10.5 (status transitions + retry limit) → merged into Property 22
- 8.9 and 12.2 (idempotent sketch print) → merged into Property 17
- 1.3 and 11.1 (admin gesture) → merged into Property 1
- 7.3 and 7.4 (end screen persistence) → merged into Property 10
- 14.2 and 14.3 (deletion ordering) → merged into Property 29

---

### Property 1: Admin gesture requires exact count and timing

*For any* sequence of taps in the designated top-right zone, the admin PIN screen is navigated to if and only if the sequence contains exactly 5 taps within a 3-second window; any sequence with fewer taps or taps spread over more than 3 seconds does not trigger navigation.

**Validates: Requirements 1.3, 11.1**

---

### Property 2: Consent screen displays correct retention period

*For any* active Event with any `retentionDays` value, the consent screen renders text containing that exact numerical value, dynamically sourced from the event configuration.

**Validates: Requirements 2.1, 2.2**

---

### Property 3: Decline consent never creates a session record

*For any* consent decline action, regardless of prior booth state, no session record is created in the database and the booth navigates to the idle step.

**Validates: Requirements 2.4, 2.5**

---

### Property 4: Frame list count equals active frame count

*For any* active Event with any number of active frames, the rendered frame selection screen displays exactly that number of frame thumbnails.

**Validates: Requirements 3.1**

---

### Property 5: Frame confirmation propagates correct slot geometry

*For any* valid frame with any valid `slotGeometry`, confirming that frame's selection results in the capture screen using exactly that frame's slot geometry for the crop guide overlay and photo composition.

**Validates: Requirements 3.3**

---

### Property 6: Crop guide overlay matches slot geometry

*For any* frame slot geometry (expressed as fractions), the rendered crop guide overlay's proportional position and dimensions on the camera preview match those fractional values.

**Validates: Requirements 4.1**

---

### Property 7: Retake lock is permanent once used

*For any* capture slot where a retake has been used (retake_used = true), the retake option is absent from the UI and no further retakes can be initiated for that slot.

**Validates: Requirements 4.6, 4.7**

---

### Property 8: Preview screen defaults sketch selection to second photo

*For any* three captured photos, when the preview screen is first rendered, the selected sketch photo index is 1 (the middle photo).

**Validates: Requirements 5.2**

---

### Property 9: Tapping a preview photo updates sketch selection

*For any* photo index i in {0, 1, 2}, tapping photo i on the preview screen sets `selectedPhotoIndex` to i.

**Validates: Requirements 5.3**

---

### Property 10: Back from preview clears all captures

*For any* preview screen state with any set of captured photos, tapping Back results in an empty captures array and the capture step restarting at slot index 0.

**Validates: Requirements 5.5**

---

### Property 11: composeStrip output is exactly 600×1800 px

*For any* three valid photo blobs and any valid frame with any slot geometry, `composeStrip` produces a PNG Blob with dimensions exactly 600 pixels wide and 1800 pixels tall.

**Validates: Requirements 6.1**

---

### Property 12: composeSheet output is approximately 1205×1795 px

*For any* valid strip blob and any tear-line offset value, `composeSheet` produces a JPEG Blob with dimensions approximately 1205 pixels wide and 1795 pixels tall (±1 px rounding tolerance).

**Validates: Requirements 6.2**

---

### Property 13: Session record exists before any upload attempt

*For any* booth session confirm flow, the session record creation API call completes before any Supabase Storage upload is attempted.

**Validates: Requirements 6.4**

---

### Property 14: Sketch job initiation does not block print job creation

*For any* session confirm flow where sketch job initiation is artificially delayed, the print job creation call completes and returns successfully without waiting for the sketch job response.

**Validates: Requirements 6.6**

---

### Property 15: Upload failures are enqueued to IndexedDB

*For any* network failure occurring during a Supabase Storage upload, the pending upload entry and session record are stored in IndexedDB with correct retry metadata (type, sessionId, retries = 0).

**Validates: Requirements 6.7**

---

### Property 16: Print job creation is idempotent per session

*For any* session and any number N ≥ 1 of strip print job creation calls for that session, exactly one print job record of type 'strip' exists for that session in the database.

**Validates: Requirements 6.8**

---

### Property 17: Sketch print job creation is idempotent per session

*For any* session and any number N ≥ 1 of "Request Print" actions on the Session Page, exactly one sketch print job record exists for that session in the database.

**Validates: Requirements 8.9, 12.2**

---

### Property 18: End screen persists until explicit dismiss or timeout

*For any* print job status received via Realtime, the booth end screen remains visible until either the visitor taps "Selesai" or 45 seconds have elapsed since the end screen was displayed; Realtime status updates alone do not cause auto-advance.

**Validates: Requirements 7.3, 7.4**

---

### Property 19: End screen dismiss clears all in-memory state

*For any* end screen state with any captured photos or session data in memory, dismissing the end screen (via "Selesai" tap or 45-second timeout) results in an empty captures array, null session data, and the booth step returning to idle.

**Validates: Requirements 7.6**

---

### Property 20: QR code encodes correct session URL with sufficient error correction

*For any* session token, the QR code rendered on the end screen encodes the URL `/s/{token}` and uses error correction level M or higher.

**Validates: Requirements 7.7**

---

### Property 21: Session page renders correct section for every sketch job status

*For any* sketch job status value in {pending, processing, done, failed, failed_safety}, the session page renders the appropriate UI section: progress indicator for pending/processing, sketch image for done, and a hidden section with neutral message (no error details) for failed/failed_safety.

**Validates: Requirements 8.4, 8.5, 8.6**

---

### Property 22: Session page renders correct section for every live photo status

*For any* live_photo_status value in {pending, processing, done, failed}, the session page renders the corresponding UI state; for failed, the section is hidden with a neutral message.

**Validates: Requirements 8.3, 18.2**

---

### Property 23: Request Print button gated by 90-second heartbeat threshold

*For any* print station heartbeat `last_seen` timestamp, the "Request Print" button is enabled if and only if `(now - last_seen) < 90 000 ms`.

**Validates: Requirements 8.8**

---

### Property 24: Invalid session token returns generic not-found page

*For any* string value used as a session token that does not match any record in the database, the session page renders a generic not-found response containing no data about valid sessions.

**Validates: Requirements 8.11**

---

### Property 25: Print job claim is atomic — at most one claimant succeeds

*For any* print job in `queued` status and any number of concurrent claim attempts, exactly one claimant transitions the job to `printing`; all other concurrent claims are rejected (UPDATE affects 0 rows).

**Validates: Requirements 9.2**

---

### Property 26: Print job status correctly reflects printing outcome

*For any* print job and any mock printer outcome, a successful print sets status to `printed` and a failed print sets status to `failed` with a non-null `error_reason`.

**Validates: Requirements 9.4, 9.5**

---

### Property 27: Recoverable printer errors retain jobs for retry

*For any* paper-out or ink-out detection event followed by a resolution event, the affected print job transitions back to `queued` status and is not deleted or permanently failed.

**Validates: Requirements 9.7, 9.8**

---

### Property 28: Jam-failed jobs are not auto-retried

*For any* paper jam detection event, the affected print job status is set to `failed` with `error_reason = 'paper_jam'`, and no automatic retry is enqueued or scheduled.

**Validates: Requirements 9.9**

---

### Property 29: Sketch job status follows valid state machine transitions

*For any* sketch job execution path, the sequence of status values observed forms a valid path in the state machine `pending → processing → {done | failed | failed_safety}`, with retry count never exceeding 1.

**Validates: Requirements 10.4, 10.5**

---

### Property 30: Safety filter response produces failed_safety status

*For any* Gemini API response that triggers a safety filter, the sketch job status is set to `failed_safety` and not `failed` or any other value.

**Validates: Requirements 10.8**

---

### Property 31: Sketch job is limited to one per session

*For any* session and any number of sketch webhook triggers, exactly one sketch job is processed; subsequent triggers are no-ops due to the unique constraint on `session_id`.

**Validates: Requirements 10.9**

---

### Property 32: Daily sketch cap is enforced before Gemini API calls

*For any* event with `daily_sketch_cap = N`, after N sketch jobs with status `done` exist for that event on the current day, any additional sketch job for that event is set to `failed` without making a Gemini API call.

**Validates: Requirements 10.10**

---

### Property 33: Every sketch outcome produces a valid structured JSON log entry

*For any* sketch job execution outcome (done, failed, failed_safety, cap_reached, retry), the log output for that outcome is valid JSON containing at minimum the fields `ts`, `event`, and `sessionId`.

**Validates: Requirements 10.11, 16.3**

---

### Property 34: Successful sketch job produces a 600×1800 px card

*For any* successfully completed sketch job, the composed Sketch Card stored at `card_path` has dimensions exactly 600 pixels wide and 1800 pixels tall.

**Validates: Requirements 10.12**

---

### Property 35: Sketch sheet left half contains sketch, right half is white

*For any* sketch card blob, `composeSketchSheet` produces a sheet where the pixel data in the left half (x < tearLineOffset) matches the sketch card content and the right half (x ≥ tearLineOffset) is white (#FFFFFF).

**Validates: Requirements 12.3**

---

### Property 36: Frame pixel inputs convert to correct fractions and aspect ratio

*For any* valid pixel inputs (px, py, pw, ph) where px + pw ≤ 600 and py + ph ≤ 1800, the stored slot geometry satisfies: `x = px/600`, `y = py/1800`, `w = pw/600`, `h = ph/1800`, and `aspectRatio = pw/ph`.

**Validates: Requirements 11.7**

---

### Property 37: Admin PIN lockout activates after 5 consecutive failures

*For any* sequence of 5 consecutive incorrect PIN attempts, the 6th attempt is rejected before PIN validation and `locked_until` is set to approximately `now + 5 minutes`.

**Validates: Requirements 11.4**

---

### Property 38: Admin JWT validity is at most 10 minutes

*For any* correct PIN submission, the returned JWT has an `exp` claim that is at most 600 seconds (10 minutes) after the `iat` claim.

**Validates: Requirements 11.3**

---

### Property 39: IndexedDB FIFO eviction at capacity

*For any* IndexedDB pending queue that is at its 50-entry capacity, adding a new entry evicts the entry with the lowest `createdAt` timestamp (oldest entry), and the new entry is stored.

**Validates: Requirements 13.2**

---

### Property 40: Offline queue flush processes session entries first

*For any* mixed IndexedDB queue containing both `session` type entries and `upload` type entries, the flush operation processes all `session` entries before processing any `upload` or `confirm` entries.

**Validates: Requirements 13.3**

---

### Property 41: Offline indicator height constraint

*For any* offline network state, the rendered offline indicator has a CSS computed height of at most 40 pixels.

**Validates: Requirements 13.4**

---

### Property 42: Every error state renders a recovery action

*For any* `BoothError` value that transitions the booth to an error step, the rendered UI contains at least one interactive recovery element (button or link) that allows the visitor to proceed.

**Validates: Requirements 13.5**

---

### Property 43: Storage deletion precedes DB record deletion

*For any* retention-expired session processed by the deletion job, the Supabase Storage API delete call for that session's assets is invoked and completes before the corresponding database record delete is attempted.

**Validates: Requirements 14.2**

---

### Property 44: Partial storage failure preserves DB record

*For any* retention-expired session where at least one storage delete call fails, the corresponding database record is not deleted and remains intact.

**Validates: Requirements 14.3**

---

### Property 45: Active print jobs block asset deletion

*For any* session that has at least one print job with status in {queued, printing}, the deletion job leaves all assets and the session record intact for that session.

**Validates: Requirements 14.4**

---

### Property 46: Session tokens have at least 96 bits of entropy

*For any* generated session token, the token is derived from exactly 12 bytes (96 bits) of output from `crypto.getRandomValues`, ensuring the token space has at least 2^96 distinct values.

**Validates: Requirements 15.1**

---

### Property 47: Signed upload URLs expire within 10 minutes

*For any* signed upload URL generated by `POST /api/sessions`, the URL's expiry is at most 600 seconds from the time of generation.

**Validates: Requirements 15.6**

---

### Property 48: All booth UI strings sourced from i18n module

*For any* rendered booth component, all visible text strings match values defined in `apps/web/i18n/id.ts` and no string literals appear hardcoded in component source.

**Validates: Requirements 17.4**

---

### Property 49: Print station considers station offline after 90-second heartbeat gap

*For any* print station heartbeat `last_seen` timestamp, the system computes `isOnline = (now - last_seen) < 90 000 ms`; this value is consistent across both the session page "Request Print" gate and the admin status display.

**Validates: Requirements 9.11**

---

### Property 50: Gemini model name sourced from environment variable

*For any* value set in the `GEMINI_MODEL_NAME` environment variable, every Gemini API call made by the sketch worker uses that exact model name string.

**Validates: Requirements 10.3**
