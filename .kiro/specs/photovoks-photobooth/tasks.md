# Implementation Plan: Photovoks Photobooth

## Overview

This plan builds the Photovoks photobooth platform incrementally, starting with the monorepo foundation and shared types, then layering the database, API, booth UI, print station, AI worker, and supporting features. Each task builds on the previous and ends with all code wired into a running, testable system.

---

## Tasks

- [x] 1. Project Scaffold & Shared Foundation
  - [x] 1.1 Initialize monorepo with pnpm workspaces; create `apps/web` (Next.js App Router + TypeScript), `apps/print-station` (Electron + Vite + TypeScript), and `packages/shared-types` directories with their respective `package.json` files and tsconfig paths wired together
    - Set up root `pnpm-workspace.yaml` referencing `apps/*` and `packages/*`
    - Bootstrap Next.js with `--typescript --app --tailwind` in `apps/web`
    - Create `packages/shared-types/src/index.ts` exporting all shared interfaces: `SlotGeometry`, `Event`, `Frame`, `SessionStatus`, `PrintJobStatus`, `SketchJobStatus`, `LivePhotoStatus`, `PrintJob`, `SketchJob`, `BoothState`, `BoothAction`, `BoothStep`, `LogEntry`
    - Export `generateSessionToken()` in `packages/shared-types/src/token.ts`
    - Create `apps/web/i18n/id.ts` with all Bahasa Indonesia strings for booth, session page, and error states
    - _Requirements: 17.4, 15.1_

  - [ ]* 1.2 Write property test for session token entropy
    - **Property 46: Session tokens have at least 96 bits of entropy**
    - **Validates: Requirements 15.1**

- [x] 2. Database Schema & RLS
  - [x] 2.1 Write Supabase migration files in `supabase/migrations/` for all tables: `events`, `frames`, `sessions`, `print_jobs`, `sketch_jobs`, `prompt_templates`, `admin_users`, `print_station_heartbeat`; include all columns, UNIQUE constraints (`sessions.token`, `sketch_jobs.session_id`, `UNIQUE(session_id, type)` on `print_jobs`), foreign keys with cascade deletes, and `UNIQUE(session_id)` on `sketch_jobs`
    - Add `live_photo_status` column on `sessions` with enum `pending | processing | done | failed`
    - Add `expires_at` column on `sessions`
    - _Requirements: 15.4, 18.1_

  - [x] 2.2 Write RLS policies for all tables and create private Supabase Storage buckets (`sessions`, `sketches`, `frames`); write a scoped anon key policy granting print station read/update on `print_jobs` and upsert on `print_station_heartbeat`
    - Ensure service role key is never referenced in client-accessible paths
    - _Requirements: 15.4, 15.5, 15.3_

- [x] 3. Session Creation & Token Flow
  - [x] 3.1 Implement `POST /api/sessions` route in `apps/web/app/api/sessions/route.ts`: validate `eventId` references an active event, generate session token via `generateSessionToken()`, INSERT sessions record, generate 5 signed upload URLs (3 photos + strip + sheet) with 10-minute expiry scoped to `sessions/{sessionId}/`, return `{ sessionId, sessionToken, uploadUrls }`
    - Apply rate-limiting via Vercel edge middleware on this route
    - _Requirements: 6.4, 15.1, 15.6_

  - [x] 3.2 Implement `POST /api/sessions/[id]/confirm` route: validate Bearer token matches session, verify all 5 uploads via Storage HEAD checks, upsert `print_jobs` record (type=`strip`, status=`queued`) idempotently, upsert `sketch_jobs` record (status=`pending`) idempotently, update `sessions.status` → `composed`, return `{ printJobId, sketchJobId }`
    - _Requirements: 6.5, 6.8, 6.6_

  - [x] 3.3 Implement `GET /api/sessions/[token]/status` route: look up session by token, join sketch_job and print_job, compute `printStationOnline = (now - lastHeartbeat) < 90s`, return combined payload; return generic 404 (no token details) when token is not found
    - _Requirements: 8.11, 9.11_

  - [ ]* 3.4 Write property test for signed upload URL expiry
    - **Property 47: Signed upload URLs expire within 10 minutes**
    - **Validates: Requirements 15.6**

  - [ ]* 3.5 Write property test for idempotent print job creation
    - **Property 16: Print job creation is idempotent per session**
    - **Validates: Requirements 6.8**

  - [ ]* 3.6 Write property test for sketch job single-per-session uniqueness
    - **Property 31: Sketch job is limited to one per session**
    - **Validates: Requirements 10.9**

- [x] 4. Booth UI Shell & Doodle Visual Style
  - [x] 4.1 Configure global CSS in `apps/web/app/globals.css` with design tokens (`--color-bg: #FDFAF3`, `--color-accent: #E85D26`, `--color-ink: #1A1A1A`, `--font-display: 'Caveat'`, `--font-body: 'Inter'`); add `prefers-reduced-motion` ruleset disabling all `animation` and `transition` on `.wobble`, `.bounce`, `[data-animate]`; configure `next/font` for Caveat and Inter
    - _Requirements: 17.1, 17.3_

  - [x] 4.2 Create doodle primitive components in `apps/web/components/doodle/`: `DoodleButton` (`<button>` with SVG hand-drawn border, Caveat label, wobble animation), `DoodleCard` (`<div>` with hand-drawn SVG border overlay), `DoodleBorder` (standalone SVG border for arbitrary wrappers); ensure components consume i18n strings from `id.ts` and contain no hardcoded text
    - _Requirements: 17.1, 17.2, 17.4_

  - [ ]* 4.3 Write property test for i18n string coverage
    - **Property 48: All booth UI strings sourced from i18n module**
    - **Validates: Requirements 17.4**

- [x] 5. Idle Screen & Admin Entry Trigger
  - [x] 5.1 Implement `apps/web/app/(booth)/` route group with a `BoothProvider` wrapping `BoothContext` + `useReducer` holding full `BoothState`; implement the idle screen component with doodle style, off-white background, tap-to-start prompt, and 60-second `useIdleTimer` hook (monitors `pointerdown`, `pointermove`, `keydown`) that dispatches `RESET` and returns to idle; register Service Worker in the app shell layout
    - _Requirements: 1.1, 1.2_

  - [x] 5.2 Implement `useAdminGesture` hook: count taps in top-right quadrant (x > 80%, y < 20%) within a 3-second rolling window; navigate to `/admin/pin` on exactly 5 taps; reset counter on timeout
    - _Requirements: 1.3, 11.1_

  - [x]* 5.3 Write property test for admin gesture detection
    - **Property 1: Admin gesture requires exact count and timing**
    - **Validates: Requirements 1.3, 11.1**

  - [x] 5.4 Implement Screen Wake Lock (`navigator.wakeLock.request('screen')`) in the booth app shell; re-acquire lock on `visibilitychange`; scaffold Service Worker registration (`apps/web/public/sw.js` stub and registration call in layout)
    - _Requirements: 13.1_

- [x] 6. Admin Authentication
  - [x] 6.1 Implement `POST /api/admin/verify-pin` route: read PIN from request body, look up bcrypt hash from `admin_users`, check lockout (`locked_until`), compare with `bcrypt.compare`, increment `failed_attempts` on failure, set `locked_until = now + 5 min` after 5 consecutive failures, issue Supabase Auth JWT (10-minute validity) on success, return appropriate error codes; never return the PIN hash to client
    - _Requirements: 11.2, 11.3, 11.4_

  - [x] 6.2 Create `apps/web/app/admin/pin/page.tsx` PIN entry screen (numeric keypad, not doodle style); wire to `POST /api/admin/verify-pin`; implement `useActivityTimer` hook that calls `supabase.auth.signOut()` after 10 minutes of inactivity, protecting all `/admin/*` routes via Next.js middleware that validates the Admin JWT
    - _Requirements: 11.5, 11.2_

  - [ ]* 6.3 Write property test for admin PIN lockout
    - **Property 37: Admin PIN lockout activates after 5 consecutive failures**
    - **Validates: Requirements 11.4**

  - [ ]* 6.4 Write property test for admin JWT validity window
    - **Property 38: Admin JWT validity is at most 10 minutes**
    - **Validates: Requirements 11.3**

- [x] 7. Admin — Event & Frame Management
  - [x] 7.1 Create admin CRUD pages for Events (`apps/web/app/admin/events/`): list, create, edit (name, retention days, status, daily sketch cap, tear-line offset); implement soft-delete (set status to `archived`); block switching the active event if a visitor session is currently active (check `sessions` table for status not in terminal states)
    - _Requirements: 11.6_

  - [x] 7.2 Create admin Frame management pages (`apps/web/app/admin/frames/`): upload frame PNG to `frames/` Storage bucket, list frames for an event, reorder (drag or up/down), deactivate, soft-delete; implement `SlotGeometryEditor` component accepting pixel inputs (x, y, w, h) relative to 600×1800 canvas, converting to fractions via `pixelToFraction()` on save, auto-computing `aspectRatio`; render a `<canvas>` or `<div>` overlay showing slot rectangles as transparent coloured overlays on the frame thumbnail, updating live on every keystroke
    - _Requirements: 11.6, 11.7, 11.8_

  - [ ]* 7.3 Write property test for pixel-to-fraction slot geometry conversion
    - **Property 36: Frame pixel inputs convert to correct fractions and aspect ratio**
    - **Validates: Requirements 11.7**

- [x] 8. Booth Flow — Consent & Frame Selection
  - [x] 8.1 Implement consent screen component at `(booth)/consent`: display Bahasa Indonesia consent text with retention days dynamically loaded from active Event; show "Saya Setuju" and "Tidak" buttons; on accept dispatch `ACCEPT_CONSENT` and navigate to frames; on decline dispatch `DECLINE_CONSENT` and return to idle without calling `POST /api/sessions`
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

  - [ ]* 8.2 Write property test for consent screen retention period display
    - **Property 2: Consent screen displays correct retention period**
    - **Validates: Requirements 2.1, 2.2**

  - [ ]* 8.3 Write property test for decline consent never creating a session record
    - **Property 3: Decline consent never creates a session record**
    - **Validates: Requirements 2.4, 2.5**

  - [x] 8.4 Implement frame selection screen at `(booth)/frames`: fetch active frames for the active event, render as film-strip thumbnails using doodle card style; on tap show full-frame preview overlay before confirm; dispatch `SELECT_FRAME` and navigate to capture on confirm; display error state with "Kembali ke Awal" if no active frames exist
    - _Requirements: 3.1, 3.2, 3.3, 3.4_

  - [ ]* 8.5 Write property test for frame list count matching active frames
    - **Property 4: Frame list count equals active frame count**
    - **Validates: Requirements 3.1**

  - [ ]* 8.6 Write property test for frame selection propagating slot geometry
    - **Property 5: Frame confirmation propagates correct slot geometry**
    - **Validates: Requirements 3.3**

- [x] 9. Booth Flow — Camera Capture
  - [x] 9.1 Implement `apps/web/lib/camera/index.ts`: `startCamera()` (front-facing `getUserMedia`), `captureFrame(video): Promise<Blob>` (draws video frame to OffscreenCanvas cropped to slot aspect ratio), `stopCamera(stream)`; implement capture screen at `(booth)/capture` that renders live camera preview with a transparent crop guide overlay positioned using slot fractional geometry × rendered video dimensions; display 3-2-1 countdown on capture initiation; sequence through 3 slots
    - _Requirements: 4.1, 4.2, 4.3_

  - [x] 9.2 Wire retake logic in capture screen: after each capture show a "Foto Ulang" button if `retakesUsed[slotIndex]` is false; dispatch `USE_RETAKE` on tap and re-capture; once retake is used, hide the button and lock the slot; enforce max 1 retake per slot in the reducer
    - _Requirements: 4.4, 4.5, 4.6, 4.7_

  - [ ]* 9.3 Write property test for crop guide overlay matching slot geometry
    - **Property 6: Crop guide overlay matches slot geometry**
    - **Validates: Requirements 4.1**

  - [ ]* 9.4 Write property test for retake lock permanence
    - **Property 7: Retake lock is permanent once used**
    - **Validates: Requirements 4.6, 4.7**

- [x] 10. Booth Flow — Preview, Compose & Upload
  - [x] 10.1 Create `apps/web/lib/canvas/compose.ts` with `composeStrip(photos, frameBlob, geometry): Promise<Blob>` (OffscreenCanvas 600×1800, draw each photo into slot, draw frame PNG on top, output PNG) and `composeSheet(strip, tearLineOffsetPx): Promise<Blob>` (OffscreenCanvas 1205×1795, two strip instances, JPEG quality 0.92); implement preview screen at `(booth)/preview` compositing photos into selected frame on a Canvas element for display
    - _Requirements: 6.1, 6.2, 5.1_

  - [ ]* 10.2 Write property test for composeStrip output dimensions
    - **Property 11: composeStrip output is exactly 600×1800 px**
    - **Validates: Requirements 6.1**

  - [ ]* 10.3 Write property test for composeSheet output dimensions
    - **Property 12: composeSheet output is approximately 1205×1795 px**
    - **Validates: Requirements 6.2**

  - [x] 10.4 Implement sketch photo selection in preview screen: default `selectedPhotoIndex` to 1 (middle photo); tap on any of the three composited photo areas sets `selectedPhotoIndex`; "Kembali" button dispatches back-from-preview action clearing all captures and returning to capture slot 0; "Cetak" button confirms and proceeds to composing step
    - _Requirements: 5.2, 5.3, 5.4, 5.5_

  - [ ]* 10.5 Write property test for preview screen default sketch selection
    - **Property 8: Preview screen defaults sketch selection to second photo**
    - **Validates: Requirements 5.2**

  - [ ]* 10.6 Write property test for tapping preview photo updating sketch selection
    - **Property 9: Tapping a preview photo updates sketch selection**
    - **Validates: Requirements 5.3**

  - [ ]* 10.7 Write property test for back-from-preview clearing all captures
    - **Property 10: Back from preview clears all captures**
    - **Validates: Requirements 5.5**

  - [x] 10.8 Implement upload orchestration in `(booth)/composing`: call `POST /api/sessions` to create session record and obtain signed URLs, run `composeStrip` + `composeSheet` on Canvas, upload 5 files (3 photos + strip + sheet) directly to Supabase Storage via signed URLs without routing through Vercel, then call `POST /api/sessions/[id]/confirm`; on network error enqueue to IndexedDB via `apps/web/lib/offline/queue.ts` and retry with exponential backoff (2s base, max 5 retries); on success dispatch `UPLOAD_COMPLETE` and navigate to end screen
    - _Requirements: 6.3, 6.4, 6.5, 6.7, 6.8_

  - [ ]* 10.9 Write property test for session record existing before upload attempt
    - **Property 13: Session record exists before any upload attempt**
    - **Validates: Requirements 6.4**

  - [ ]* 10.10 Write property test for upload failures being enqueued to IndexedDB
    - **Property 15: Upload failures are enqueued to IndexedDB**
    - **Validates: Requirements 6.7**

  - [ ]* 10.11 Write property test for sketch job not blocking print job creation
    - **Property 14: Sketch job initiation does not block print job creation**
    - **Validates: Requirements 6.6**

- [x] 11. Checkpoint — Ensure all tests pass, ask the user if questions arise.

- [x] 12. Booth Flow — End Screen & QR Code
  - [x] 12.1 Implement end screen at `(booth)/end`: display printing status text ("Sedang mencetak…"), render `<QRCodeSVG>` from `qrcode.react` encoding `/s/{token}` with error correction level M, minimum size for legibility, high contrast; subscribe to Supabase Realtime channel `session:{sessionId}` to receive print job status updates and update displayed status text; "Selesai" button dispatches `DISMISS_END_SCREEN`; 45-second timeout also dispatches dismiss; on dismiss clear all state and return to idle
    - _Requirements: 7.1, 7.2, 7.3, 7.6, 7.7_

  - [ ]* 12.2 Write property test for end screen persistence until explicit dismiss
    - **Property 18: End screen persists until explicit dismiss or timeout**
    - **Validates: Requirements 7.3, 7.4**

  - [ ]* 12.3 Write property test for end screen dismiss clearing all in-memory state
    - **Property 19: End screen dismiss clears all in-memory state**
    - **Validates: Requirements 7.6**

  - [ ]* 12.4 Write property test for QR code encoding and error correction
    - **Property 20: QR code encodes correct session URL with sufficient error correction**
    - **Validates: Requirements 7.7**

  - [x] 12.5 Handle Realtime unavailability on end screen: catch subscription errors and display "Status cetak tidak dapat dikonfirmasi." message; still honour 45-second timeout; if uploads are still pending when end screen mounts, display QR code alongside "Unggahan masih berlangsung…" note
    - _Requirements: 7.5, 7.8_

- [x] 13. Print Station — Electron App Foundation
  - [x] 13.1 Scaffold `apps/print-station/` as an Electron app with Vite + TypeScript renderer (React); configure `electron-builder` for macOS (dmg) and Windows (nsis) targets; set up `electron-log` for structured local logging; create main process entry `src/main/index.ts` and renderer entry `src/renderer/App.tsx`
    - _Requirements: 9.3_

  - [x] 13.2 Implement `PrintDriver` interface in `src/drivers/interface.ts` with `isAvailable()`, `listPrinters()`, `print(filePath, printerName, options)`, and `detectError(output): PrintError | null`; implement `CupsPrintDriver` in `src/drivers/cups.ts` (executes `lp -d {printerName} -o media=4x6 -o fit-to-page {filePath}`, parses stderr for `paper-out | jam | ink`); implement `SumatraPrintDriver` in `src/drivers/sumatra.ts` (executes `SumatraPDF.exe -print-to ... -print-settings "fit,paper=4x6"`, parses exit code and stderr); auto-detect platform: `process.platform === 'darwin'` → CupsPrintDriver, else SumatraPrintDriver
    - _Requirements: 9.3_

  - [x] 13.3 Create local SQLite database using `better-sqlite3` with the `local_jobs` schema (`id`, `session_id`, `type`, `status`, `asset_path`, `error_reason`, `created_at`, `updated_at`); implement local queue read/write helpers in `src/main/local-queue.ts`
    - _Requirements: 9.12_

  - [x] 13.4 Build React renderer UI in `src/renderer/`: display recent 20 jobs list, current printer status badge, station online/offline indicator, manual reprint button; listen for `job-update` IPC events from main process; create config screen for printer name selection and Supabase URL/key entry
    - _Requirements: 9.3, 11.6_

- [x] 14. Print Station — Job Processing & Realtime
  - [x] 14.1 Implement Supabase client in main process using service role key (read from electron-store config); subscribe to `print_jobs` Realtime channel filtered by `status=eq.queued`; implement atomic claim in `src/main/job-processor.ts`: `UPDATE print_jobs SET status='printing' WHERE id=? AND status='queued'` — proceed only if `rowCount = 1`; implement polling fallback every 10 seconds when Realtime connection is dropped
    - _Requirements: 9.1, 9.2_

  - [ ]* 14.2 Write property test for atomic print job claim
    - **Property 25: Print job claim is atomic — at most one claimant succeeds**
    - **Validates: Requirements 9.2**

  - [x] 14.3 Wire full job lifecycle in `job-processor.ts`: after atomic claim, download sheet asset from Supabase Storage signed URL, save to temp file, call `driver.print(...)`, on success PATCH `print_jobs.status` → `printed`, on failure run `detectError(output)` — paper-out/ink-out → retain job in `queued` for retry; jam → set `failed` + `error_reason='paper_jam'` with no auto-retry; unknown failure → set `failed` with error reason; store job state in local SQLite throughout
    - _Requirements: 9.4, 9.5, 9.7, 9.8, 9.9, 9.12_

  - [ ]* 14.4 Write property test for print job status correctly reflecting outcome
    - **Property 26: Print job status correctly reflects printing outcome**
    - **Validates: Requirements 9.4, 9.5**

  - [ ]* 14.5 Write property test for recoverable printer errors retaining jobs
    - **Property 27: Recoverable printer errors retain jobs for retry**
    - **Validates: Requirements 9.7, 9.8**

  - [ ]* 14.6 Write property test for jam-failed jobs not being auto-retried
    - **Property 28: Jam-failed jobs are not auto-retried**
    - **Validates: Requirements 9.9**

  - [x] 14.7 Implement 30-second heartbeat: UPSERT `print_station_heartbeat` every 30s in main process; implement Realtime reconnection with exponential backoff `Math.min(2000 * 2**attempt, 60000)` ms, re-subscribing if client-level reconnect fails after 5 attempts; send `job-update` IPC events to renderer on every status change
    - _Requirements: 9.10, 9.13_

- [x] 15. Session Page (`/s/[token]`)
  - [x] 15.1 Implement `apps/web/app/s/[token]/page.tsx` as a server component: call `GET /api/sessions/[token]/status`, call `notFound()` on 404 (generic page, no token details leaked); pass `initialData` to `SessionView` client component; implement `SessionView` subscribing to Realtime channel `session:{sessionId}` for live sketch_job_status, live_photo_status, print_job_status updates
    - _Requirements: 8.1, 8.11, 8.12_

  - [x] 15.2 Render strip section with downloadable image link; render Live Photo scaffold section with four states (pending/processing/done/failed) — hide section with neutral Bahasa Indonesia message on `failed` status, no MediaRecorder implementation
    - _Requirements: 8.2, 8.3, 18.1, 18.2, 18.3_

  - [ ]* 15.3 Write property test for session page rendering correct section for every sketch job status
    - **Property 21: Session page renders correct section for every sketch job status**
    - **Validates: Requirements 8.4, 8.5, 8.6**

  - [ ]* 15.4 Write property test for session page rendering correct section for every live photo status
    - **Property 22: Session page renders correct section for every live photo status**
    - **Validates: Requirements 8.3, 18.2**

  - [x] 15.5 Implement heartbeat-gated "Request Print" button: compute `isStationOnline = (Date.now() - lastHeartbeatMs) < 90_000`, refresh every 30s via polling `GET /api/admin/status`; call `POST /api/print-jobs/sketch` (session token auth, idempotent via unique constraint) on tap; display sketch print job status (queued/printing/printed/failed) via Realtime; handle printer offline state with disabled button
    - _Requirements: 8.8, 8.9, 8.10, 12.1_

  - [ ]* 15.6 Write property test for Request Print button heartbeat gate
    - **Property 23: Request Print button gated by 90-second heartbeat threshold**
    - **Validates: Requirements 8.8**

  - [ ]* 15.7 Write property test for idempotent sketch print job creation
    - **Property 17: Sketch print job creation is idempotent per session**
    - **Validates: Requirements 8.9, 12.2**

  - [ ]* 15.8 Write property test for invalid session token returning generic not-found
    - **Property 24: Invalid session token returns generic not-found page**
    - **Validates: Requirements 8.11**

  - [ ]* 15.9 Write property test for print station online threshold consistency
    - **Property 49: Print station considers station offline after 90-second heartbeat gap**
    - **Validates: Requirements 9.11**

- [x] 16. Checkpoint — Ensure all tests pass, ask the user if questions arise.

- [x] 17. AI Sketch Worker
  - [x] 17.1 Implement `POST /api/sketch/process` route in `apps/web/app/api/sketch/process/route.ts` with `export const maxDuration = 60`: validate Supabase webhook secret header, parse `sketch_job_id` from payload, check daily cap (`SELECT count(*) WHERE event_id=? AND date=today AND status='done'`) and mark `failed` without calling Gemini if cap reached; transition `pending → processing` via optimistic UPDATE (prevent duplicate processing); fetch prompt template for event
    - _Requirements: 10.2, 10.10, 10.9_

  - [ ]* 17.2 Write property test for daily sketch cap enforced before Gemini API calls
    - **Property 32: Daily sketch cap is enforced before Gemini API calls**
    - **Validates: Requirements 10.10**

  - [x] 17.3 Call Gemini API using model name from `process.env.GEMINI_MODEL_NAME`; handle outcomes: success → upload raw sketch to Storage; 429 → retry once after 2s delay → if still 429 set `failed`; timeout >55s → set `failed` immediately; safety filter → set `failed_safety`; storage upload failure → set `failed`; emit structured JSON log entry (`ts`, `event`, `sessionId`, `details`) for every outcome
    - _Requirements: 10.3, 10.4, 10.5, 10.6, 10.7, 10.8, 10.11_

  - [ ]* 17.4 Write property test for sketch job state machine transitions and retry limit
    - **Property 29: Sketch job status follows valid state machine transitions**
    - **Validates: Requirements 10.4, 10.5**

  - [ ]* 17.5 Write property test for safety filter producing failed_safety status
    - **Property 30: Safety filter response produces failed_safety status**
    - **Validates: Requirements 10.8**

  - [ ]* 17.6 Write property test for Gemini model name sourced from environment variable
    - **Property 50: Gemini model name sourced from environment variable**
    - **Validates: Requirements 10.3**

  - [ ]* 17.7 Write property test for structured JSON log entries on all sketch outcomes
    - **Property 33: Every sketch outcome produces a valid structured JSON log entry**
    - **Validates: Requirements 10.11, 16.3**

  - [x] 17.8 Implement `apps/web/lib/canvas/server-compose.ts` using `node-canvas` (`canvas` npm package): `composeSketchCardServer(sketchBuffer: Buffer): Promise<Buffer>` composing a 600×1800 PNG; `composeSketchSheetServer(cardBuffer, tearLineOffsetPx): Promise<Buffer>` placing sketch card on left half and white fill on right half; call these from `POST /api/sketch/process` on success, store card at `sketches/{sessionId}/card.png`, update `sketch_jobs.card_path`
    - _Requirements: 10.12, 12.3_

  - [ ]* 17.9 Write property test for successful sketch job producing 600×1800 px card
    - **Property 34: Successful sketch job produces a 600×1800 px card**
    - **Validates: Requirements 10.12**

  - [ ]* 17.10 Write property test for sketch sheet left/right half composition
    - **Property 35: Sketch sheet left half contains sketch, right half is white**
    - **Validates: Requirements 12.3**

- [x] 18. Sketch Prompt Template Admin
  - [x] 18.1 Create admin prompt template management page at `apps/web/app/admin/prompts/`: textarea editor for prompt content, version list with created timestamps, "Set Active" button (updates `events.active_prompt_template_id`); implement preview by submitting a test photo through the Gemini call and displaying the result inline; seed v1 prompt via a Supabase migration or seed script
    - _Requirements: 11.6_

- [x] 19. Sketch Print Request Flow (F6)
  - [x] 19.1 Implement `POST /api/print-jobs/sketch` route: authenticate via session token (Bearer), validate sketch_job status is `done`, check print station heartbeat < 90s, upsert sketch print job (type=`sketch`, idempotent via `UNIQUE(session_id, type)`) using `composeSketchSheetServer` asset path as `asset_path`; return `{ printJobId }`; on repeat calls return existing job
    - _Requirements: 12.1, 12.2, 8.9_

  - [x] 19.2 Ensure Print Station `job-processor.ts` handles `type='sketch'` print jobs: download sketch sheet asset, print via PrintDriver, update status; no auto-print — only process when a sketch print_job record exists; update `sessions.status` on relevant state changes for session page Realtime updates
    - _Requirements: 9.6, 12.4_

- [x] 20. Admin — Print Station Monitoring & Operations
  - [x] 20.1 Create admin dashboard page at `apps/web/app/admin/dashboard/`: display print station heartbeat status (online/offline based on <90s threshold), job counts by status, "Reset Session" button (set current session to `abandoned`), "Reprint Last Strip" button (create new print job for last session's sheet asset), "Clear Queue" button (cancel all `queued` print jobs); "Switch Active Event" is blocked with a warning if a visitor session is currently active
    - _Requirements: 11.6, 9.11_

  - [ ]* 20.2 Write property test for print station online/offline threshold
    - **Property 49: Print station considers station offline after 90-second heartbeat gap**
    - **Validates: Requirements 9.11**

- [x] 21. Offline Resilience & Service Worker
  - [x] 21.1 Implement full Service Worker at `apps/web/public/sw.js` with Workbox: cache-first strategy for `/_next/static/**`, `/fonts/**`, `/frames/**` (event-keyed cache name); network-first for API routes; precache booth UI shell on install; listen for `FLUSH_QUEUE` message and `online` event to trigger IndexedDB flush
    - _Requirements: 13.1_

  - [x] 21.2 Implement `apps/web/lib/offline/queue.ts` with IndexedDB store `photovoks_pending_queue` (object store `pending_queue`, keyPath `id`): `enqueue()` with FIFO eviction at 50-entry capacity (evict lowest `createdAt`), `flush()` processing `session` entries before `upload` before `confirm` with exponential backoff `2000 * 2**retries` (cap retries at 4), `getAll()`, `remove()`; trigger `flush()` on `window.online` event in app shell
    - _Requirements: 13.2, 13.3_

  - [ ]* 21.3 Write property test for IndexedDB FIFO eviction at capacity
    - **Property 39: IndexedDB FIFO eviction at capacity**
    - **Validates: Requirements 13.2**

  - [ ]* 21.4 Write property test for offline queue flush ordering
    - **Property 40: Offline queue flush processes session entries first**
    - **Validates: Requirements 13.3**

  - [x] 21.5 Implement offline indicator component: renders a non-blocking banner at the top of the booth UI, sourcing text from `id.ts` (`offline.indicator`), with a maximum CSS height of `40px`; bind visibility to `window.online/offline` events; ensure every booth error state renders a recovery CTA (audit all `BoothError` cases in reducer and confirm each has a recovery element in the error screen component)
    - _Requirements: 13.4, 13.5_

  - [ ]* 21.6 Write property test for offline indicator height constraint
    - **Property 41: Offline indicator height constraint**
    - **Validates: Requirements 13.4**

  - [ ]* 21.7 Write property test for every error state rendering a recovery action
    - **Property 42: Every error state renders a recovery action**
    - **Validates: Requirements 13.5**

- [x] 22. Privacy, Retention & Observability
  - [x] 22.1 Implement daily deletion job as a Supabase Edge Function or Postgres cron: query expired sessions with no active print jobs (status not in `queued|printing`); for each candidate call Supabase Storage delete for all objects under `sessions/{id}/**` and `sketches/{id}/**`; only delete the DB session record after all Storage deletes succeed; skip any session with a queued/printing print job; emit structured JSON log per deletion
    - _Requirements: 14.1, 14.2, 14.3, 14.4_

  - [ ]* 22.2 Write property test for storage deletion preceding DB record deletion
    - **Property 43: Storage deletion precedes DB record deletion**
    - **Validates: Requirements 14.2**

  - [ ]* 22.3 Write property test for partial storage failure preserving DB record
    - **Property 44: Partial storage failure preserves DB record**
    - **Validates: Requirements 14.3**

  - [ ]* 22.4 Write property test for active print jobs blocking asset deletion
    - **Property 45: Active print jobs block asset deletion**
    - **Validates: Requirements 14.4**

  - [x] 22.5 Audit and add structured JSON logging (`console.log(JSON.stringify(entry))`) for all session lifecycle events (created, photos captured, strip composed, uploaded, abandoned), print job lifecycle events (created, claimed, printing, printed, failed + reason), and admin action events (login, logout, lockout, event change, frame change, queue clear, reprint); ensure all entries include `ts`, `level`, `event`, `sessionId` where applicable
    - _Requirements: 16.1, 16.2, 16.3, 16.4_

  - [x] 22.6 Create environment variable checklist in `README.md` listing all required env vars: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_MODEL_NAME`, `ADMIN_PIN_HASH`, `SUPABASE_WEBHOOK_SECRET`; run an RLS policy audit query confirming RLS is enabled on all tables (`SELECT tablename FROM pg_tables WHERE NOT rowsecurity`); document expected result
    - _Requirements: 15.3, 15.4_

- [x] 23. Final Checkpoint — Ensure all tests pass, ask the user if questions arise.

---

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP delivery
- Each task references specific requirements for traceability
- The design document contains 50 correctness properties; those included as sub-tasks are annotated with their property numbers for direct traceability
- All booth UI strings must come from `apps/web/i18n/id.ts` — no hardcoded strings in components
- Checkpoints at tasks 11, 16, and 23 validate cumulative progress before moving to dependent layers
- The print station (tasks 13–14) and the AI sketch worker (task 17) can be developed in parallel once the shared DB schema (task 2) and API routes (task 3) are in place
- Session page (task 15) depends on the sketch worker status flow but only needs the status enum values, not the worker itself

---

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "2.1"] },
    { "id": 2, "tasks": ["2.2", "4.1"] },
    { "id": 3, "tasks": ["3.1", "4.2", "13.1"] },
    { "id": 4, "tasks": ["3.2", "3.3", "4.3", "5.1", "13.2", "13.3"] },
    { "id": 5, "tasks": ["3.4", "3.5", "3.6", "5.2", "5.4", "6.1", "13.4", "14.1"] },
    { "id": 6, "tasks": ["5.3", "6.2", "7.1", "8.1", "9.1", "10.1", "14.3", "14.7"] },
    { "id": 7, "tasks": ["5.4", "6.3", "6.4", "7.2", "8.2", "8.3", "8.4", "9.2", "10.2", "10.3", "10.4", "14.2", "14.4", "14.5", "14.6"] },
    { "id": 8, "tasks": ["7.3", "8.5", "8.6", "9.3", "9.4", "10.5", "10.6", "10.7", "10.8", "15.1", "17.1", "18.1"] },
    { "id": 9, "tasks": ["10.9", "10.10", "10.11", "15.2", "15.5", "17.3", "17.8", "19.1", "20.1"] },
    { "id": 10, "tasks": ["12.1", "12.5", "15.3", "15.4", "15.6", "15.7", "15.8", "15.9", "17.2", "17.4", "17.5", "17.6", "17.7", "19.2", "20.2"] },
    { "id": 11, "tasks": ["12.2", "12.3", "12.4", "17.9", "17.10", "21.1", "21.2"] },
    { "id": 12, "tasks": ["21.3", "21.4", "21.5", "22.1"] },
    { "id": 13, "tasks": ["21.6", "21.7", "22.2", "22.3", "22.4", "22.5", "22.6"] }
  ]
}
```
