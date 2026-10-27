# Requirements Document

## Introduction

Photovoks is a photobooth web application for paid rental events. Visitors use an iPad to select a frame, capture three photos, and receive a printed photo strip automatically. A QR code links them to a personal session page showing their strip, a live photo scaffold, and an AI-generated sketch. The system comprises a Next.js web app (booth + session + admin), a Supabase backend (Postgres, Storage, Realtime, Auth), an Electron print station app (macOS and Windows), and a Vercel-hosted AI background job. All booth UI text is in Bahasa Indonesia.

---

## Glossary

- **Booth**: The iPad-facing photobooth interface, part of the Next.js web app.
- **Session**: A single visitor's photobooth run, identified by a high-entropy unguessable token (≥ 96 bits).
- **Strip**: A 600×1800 px PNG at 300 DPI containing three captured photos composited into a visitor-selected frame.
- **Sheet**: A ~1205×1795 px JPEG (quality ≥ 90) containing two Strip instances side-by-side, ready for 4R sticker cardstock printing.
- **Frame**: An admin-uploaded PNG with alpha, 600×1800 px, defining visual chrome and one or more photo slots described by (x, y, w, h) pixel coordinates relative to the 600×1800 canvas, stored as fractions (0–1).
- **Photo Slot**: A rectangular region within a Frame where a captured photo is composited. Each session has exactly three photo slots.
- **Sketch**: An AI-generated 600×1800 px image produced by the Gemini API from the visitor's selected photo.
- **Sketch Card**: A print-ready 600×1800 px image composed from the AI Sketch.
- **Print Job**: A Supabase DB record representing a pending, in-flight, or completed print request for either a Strip Sheet or a Sketch Card.
- **Print Station**: The Electron desktop application that polls for Print Jobs, downloads assets, and sends them to the printer.
- **PrintDriver**: An abstraction interface in the Print Station that routes print commands to CUPS (`lp`) on macOS or SumatraPDF on Windows.
- **Tear Line**: The vertical division on the 4R sheet separating the two Strip instances; default x-position ≈ 602 px, adjustable per event.
- **Event**: An admin-configured rental session defining frame choices, retention period, daily sketch cap, tear-line offset, and status.
- **Admin**: An operator who manages events, frames, print queue, and station status via a PIN-protected interface.
- **Session Page**: A mobile-first web page at `/s/[token]` showing the visitor's Strip, Live Photo scaffold, AI Sketch, and sketch print option.
- **QR Code**: A high-contrast QR code (error correction ≥ M) encoding the Session Page URL, displayed on the Booth end screen.
- **Live Photo**: A scaffold feature (DB columns + UI states only; encoding not implemented in MVP).
- **Idle Timeout**: 60 seconds of inactivity on the Booth, after which the session resets.
- **Retention Days**: Event-level setting controlling when session assets are auto-deleted.
- **Service Worker**: A browser service worker caching the Booth UI and Frame assets for offline operation.
- **IndexedDB**: Browser-side storage for pending session records and API calls during offline periods.
- **Realtime**: Supabase Realtime subscription used for Print Job status updates.
- **RLS**: Row-Level Security policies on all Supabase tables.

---

## Requirements

### Requirement 1 — Booth: Idle Screen

**User Story:** As a visitor, I want to see an inviting idle screen so that I know the booth is ready and how to begin.

#### Acceptance Criteria

1. THE Booth SHALL display an idle screen with hand-drawn / doodle sketchbook visual style, an off-white/cream background (#FDFAF3), and a prompt to tap in order to start a session.
2. WHEN the idle screen has been displayed for 60 seconds without visitor interaction, THE Booth SHALL reset any in-progress session state, clear all in-memory photos, and return to the idle screen.
3. WHEN an Admin entry gesture (five taps in the top-right corner within 3 seconds) is detected on the idle screen, THE Booth SHALL navigate to the Admin PIN entry screen.

---

### Requirement 2 — Booth: Consent Screen

**User Story:** As a visitor, I want to be informed about photo processing and data retention before capturing, so that I can make an informed decision.

#### Acceptance Criteria

1. WHEN a visitor taps to start from the idle screen, THE Booth SHALL display a consent screen stating that photos may be processed by third-party AI and will be auto-deleted after the number of retention days configured for the active Event.
2. THE Booth SHALL display the retention period value dynamically, sourced from the active Event's retention days setting.
3. WHEN a visitor accepts consent, THE Booth SHALL proceed to the Frame selection screen.
4. WHEN a visitor declines consent, THE Booth SHALL return to the idle screen without creating a session record.
5. THE Booth SHALL NOT proceed past the consent screen without an explicit visitor acceptance action.

---

### Requirement 3 — Booth: Frame Selection

**User Story:** As a visitor, I want to browse and preview available frames so that I can choose the one I like before taking photos.

#### Acceptance Criteria

1. THE Booth SHALL display all active Frames for the active Event as film-strip-style thumbnail cutouts.
2. WHEN a visitor taps a Frame thumbnail, THE Booth SHALL display a full preview of that Frame before the visitor confirms.
3. WHEN a visitor confirms a Frame selection, THE Booth SHALL proceed to the capture screen using that Frame's photo slot geometry.
4. IF no active Frames exist for the active Event, THEN THE Booth SHALL display an error state with a recovery action (return to idle).

---

### Requirement 4 — Booth: Photo Capture

**User Story:** As a visitor, I want to take three photos with a clear countdown and the ability to retake once per slot, so that I get good photos for my strip.

#### Acceptance Criteria

1. THE Booth SHALL display a live camera preview with a crop guide overlay matching the geometry of the current photo slot being captured.
2. WHEN a photo capture is initiated, THE Booth SHALL display a 3-2-1 countdown and then capture the photo.
3. THE Booth SHALL capture exactly three photos, one per photo slot, in sequence.
4. WHEN a photo has been captured for a slot and the visitor has not yet used their retake for that slot, THE Booth SHALL offer a retake option for that slot.
5. WHEN a visitor uses a retake for a photo slot, THE Booth SHALL capture a new photo for that slot and mark that slot's retake as used.
6. WHEN a retake has been used for a photo slot, THE Booth SHALL lock that slot so no further retakes are possible.
7. THE Booth SHALL limit retakes to a maximum of 1 per photo slot.

---

### Requirement 5 — Booth: Photo Preview and Sketch Selection

**User Story:** As a visitor, I want to preview my composited strip and choose which photo to use for the AI sketch so that I can confirm before printing.

#### Acceptance Criteria

1. WHEN all three photos have been captured, THE Booth SHALL display a preview of all three photos composited within the selected Frame.
2. THE Booth SHALL default the sketch photo selection to the middle (second) photo.
3. WHEN a visitor taps one of the three composited photos, THE Booth SHALL mark that photo as the sketch selection.
4. WHEN a visitor confirms the preview, THE Booth SHALL proceed to strip composition and upload.
5. WHEN a visitor taps Back on the preview screen, THE Booth SHALL return to photo capture starting from slot 1, discarding all captured photos.

---

### Requirement 6 — Booth: Strip and Sheet Composition

**User Story:** As a visitor, I want my strip to be composed and uploaded reliably so that the print station receives it and printing begins promptly.

#### Acceptance Criteria

1. WHEN a visitor confirms the preview, THE Booth SHALL compose the Strip on an HTML Canvas by compositing the three captured photos into the selected Frame at 600×1800 px.
2. THE Booth SHALL compose the Sheet by placing two Strip instances side-by-side at ~1205×1795 px, JPEG quality ≥ 90, with a tear-line at the active Event's configured x-position (default ≈ 602 px).
3. THE Booth SHALL upload the three source photos, the Strip PNG, and the Sheet JPEG to Supabase Storage via signed upload URLs (max 10-minute validity) without routing uploads through Vercel API routes.
4. THE Booth SHALL create a session record in the database before uploading assets.
5. WHEN uploads complete, THE Booth SHALL create a Strip Print Job record in the database.
6. THE Booth SHALL initiate a Sketch Job (non-blocking) in parallel with the Print Job creation, so that printing never waits on AI processing.
7. IF uploads fail due to a network error, THEN THE Booth SHALL store the pending uploads and session record in IndexedDB and retry with exponential backoff (starting at 2 seconds, maximum 5 retries).
8. THE Booth SHALL ensure Print Job creation is idempotent per session so that retried uploads never create duplicate Print Jobs.

---

### Requirement 7 — Booth: End Screen

**User Story:** As a visitor, I want to see my print status and scan a QR code to access my session page, so that I can retrieve my photos later.

#### Acceptance Criteria

1. THE Booth SHALL display an end screen showing a "printing" status and the session QR code immediately after Print Job creation.
2. WHEN the Print Station reports the Print Job status as printed via Realtime, THE Booth SHALL update the end screen to display "print complete".
3. THE Booth SHALL remain on the end screen until the visitor explicitly taps "Selesai" or 45 seconds elapse, regardless of whether printing is complete.
4. THE Booth SHALL NOT auto-advance from the end screen when the print complete status is received.
5. IF Realtime is unavailable, THEN THE Booth SHALL display a message stating that print status cannot be confirmed and shall fall back to the 45-second timeout.
6. WHEN the end screen is dismissed (by "Selesai" tap or timeout), THE Booth SHALL clear all in-memory photos and return to the idle screen.
7. THE QR code on the end screen SHALL encode the Session Page URL, use error correction level M or higher, and be displayed at adequate size with high contrast.
8. IF uploads are still pending when the end screen is displayed, THEN THE Booth SHALL display the QR code accompanied by a note indicating that uploads are still in progress.

---

### Requirement 8 — Session Page

**User Story:** As a visitor, I want a personal session page accessible via QR code that shows my strip, live photo, and AI sketch, so that I can download and optionally print the sketch.

#### Acceptance Criteria

1. THE Session Page SHALL be accessible at the path `/s/[token]` where the token is the session's unguessable high-entropy identifier.
2. THE Session Page SHALL display the visitor's Strip as a downloadable image.
3. THE Session Page SHALL display the Live Photo scaffold UI state (pending/processing/done/failed) without implementing actual video encoding in MVP.
4. WHEN the Sketch Job status is pending or processing, THE Session Page SHALL display a progress state for the AI sketch section.
5. WHEN the Sketch Job status is done, THE Session Page SHALL display the completed AI Sketch image.
6. IF the Sketch Job status is failed or failed_safety, THEN THE Session Page SHALL hide the sketch section and display a neutral message without exposing error details.
7. IF the Live Photo status is failed, THEN THE Session Page SHALL hide the live photo section and display a neutral message.
8. THE Session Page SHALL display a "Request Print" button that is enabled only when the Print Station's last heartbeat was received less than 90 seconds ago.
9. WHEN a visitor taps "Request Print" on the Session Page, THE Session Page SHALL create a Sketch Print Job authorized by the session token, limited to a maximum of 1 per session (idempotent).
10. THE Session Page SHALL display the Sketch Print Job status (queued / printing / printed / failed) using Realtime updates.
11. WHEN the session token is invalid or expired, THE Session Page SHALL display a friendly not-found page without leaking information about valid tokens or session data.
12. THE Session Page SHALL be mobile-first and functional on iOS Safari and Android Chrome.

---

### Requirement 9 — Print Station

**User Story:** As an operator, I want the print station to automatically claim and print jobs reliably, so that visitors receive their strips without manual intervention.

#### Acceptance Criteria

1. THE Print Station SHALL subscribe to Print Jobs via Supabase Realtime with a polling fallback at a default interval of 10 seconds.
2. WHEN a Print Job in the queued state is detected, THE Print Station SHALL atomically transition the job status from queued to printing before downloading the asset, ensuring no job is printed more than once.
3. THE Print Station SHALL download the Sheet asset and send it to the printer silently using CUPS (`lp`) on macOS or SumatraPDF on Windows through the PrintDriver abstraction.
4. WHEN printing succeeds, THE Print Station SHALL update the Print Job status to printed.
5. WHEN printing fails, THE Print Station SHALL update the Print Job status to failed and record a failure reason.
6. THE Print Station SHALL handle both strip Print Jobs (immediate) and sketch Print Jobs (may arrive hours after session).
7. WHEN the printer is detected as offline, THE Print Station SHALL record the error in the local log and retain the job for retry.
8. WHEN paper-out or ink-out is detected and resolved, THE Print Station SHALL return the affected Print Job to queued status for automatic retry.
9. WHEN a paper jam is detected, THE Print Station SHALL mark the job as failed and require manual reprint initiation; THE Print Station SHALL NOT automatically retry jam-failed jobs.
10. THE Print Station SHALL send a heartbeat update to the database every 30 seconds.
11. WHEN no heartbeat has been received from a Print Station for 90 seconds, THE System SHALL consider that station offline.
12. THE Print Station SHALL maintain a local log and a local job queue so that short internet drops do not cause Print Jobs to be lost.
13. THE Print Station SHALL reconnect to Supabase Realtime using exponential backoff after a connection drop.

---

### Requirement 10 — AI Sketch Generation

**User Story:** As a visitor, I want an AI-generated sketch of my selected photo to be ready on my session page, so that I can optionally request a print of it.

#### Acceptance Criteria

1. THE Sketch Job processor SHALL use the visitor's selected photo as input and SHALL NOT block Print Job creation or strip printing.
2. THE Sketch Job processor SHALL be implemented as a Vercel route with `maxDuration: 60`, triggered by a Supabase Database Webhook via pg_net.
3. THE Sketch Job processor SHALL read the Gemini model name from the environment variable `GEMINI_MODEL_NAME`.
4. THE Sketch Job processor SHALL transition Sketch Job status through the states: pending → processing → done (or failed or failed_safety).
5. THE Sketch Job processor SHALL allow a maximum of 1 auto-retry for transient errors.
6. WHEN a Gemini API 429 response is received, THE Sketch Job processor SHALL treat the error as transient and apply the single auto-retry.
7. WHEN the Gemini API call times out or returns empty or invalid output, THE Sketch Job processor SHALL mark the Sketch Job as failed.
8. WHEN the Gemini API response triggers a safety filter, THE Sketch Job processor SHALL mark the Sketch Job as failed_safety.
9. THE Sketch Job processor SHALL limit generation to 1 per session.
10. THE Sketch Job processor SHALL enforce a configurable daily cap per Event; WHEN the daily cap is reached, THE Sketch Job processor SHALL mark additional jobs as failed without calling the Gemini API.
11. THE Sketch Job processor SHALL log every generation outcome as a structured JSON entry.
12. WHEN a Sketch Job completes successfully, THE Sketch Job processor SHALL compose a print-ready Sketch Card at 600×1800 px and store it in Supabase Storage.

---

### Requirement 11 — Admin Interface

**User Story:** As an Admin, I want a PIN-protected management interface so that I can configure events, manage frames, monitor the print queue, and control the booth without requiring a separate device.

#### Acceptance Criteria

1. WHEN the Admin entry gesture (five taps in the top-right corner of the idle screen within 3 seconds) is detected, THE Booth SHALL display the Admin PIN entry screen.
2. THE Admin PIN SHALL be verified server-side; THE Booth SHALL NOT include the PIN value in the client bundle.
3. WHEN the correct PIN is entered, THE System SHALL issue an Admin JWT with a 10-minute validity.
4. WHEN five consecutive incorrect PIN attempts are made, THE System SHALL lock Admin access for 5 minutes.
5. WHEN the Admin JWT has been valid for 10 minutes without activity, THE System SHALL automatically invalidate the session and require re-authentication.
6. THE Admin interface SHALL allow the Admin to: reset the current booth session, reprint the last strip, clear the print queue, switch the active Event (blocked while a visitor session is active), view print station status and job counts, create and edit Events (name, retention days, status, daily sketch cap, tear-line offset), upload and manage Frames with pixel-based slot geometry definition and live preview overlay, reorder and deactivate Frames, soft-delete Frames, and manage sketch prompt template versions with preview.
7. WHEN the Admin defines Frame slot geometry, THE System SHALL accept manual pixel inputs (x, y, w, h) relative to the 600×1800 canvas, convert them to fractions (0–1) on save, and auto-compute the aspect ratio.
8. THE Admin interface SHALL display a live preview overlay of slot geometry on the Frame thumbnail during editing.

---

### Requirement 12 — Sketch Print via Session Page

**User Story:** As a visitor, I want to request a print of my AI sketch from the session page so that I can take home a physical copy.

#### Acceptance Criteria

1. WHEN a visitor taps "Request Print" on the Session Page, THE System SHALL create a Sketch Print Job using the session token as authorization.
2. THE System SHALL enforce a maximum of 1 Sketch Print Job per session (idempotent on repeated taps).
3. THE Print Station SHALL print the Sketch Card as a standalone strip on its own 4R sheet, with the other half of the sheet left blank.
4. THE System SHALL NOT auto-print the Sketch Card; printing SHALL only occur after a visitor explicitly requests it via the Session Page.

---

### Requirement 13 — Offline Resilience and Service Worker

**User Story:** As a visitor, I want the booth to continue working during brief internet outages so that my session is not lost.

#### Acceptance Criteria

1. THE Service Worker SHALL cache the Booth UI assets and active Frame images for offline operation.
2. WHEN the network is unavailable, THE Booth SHALL store pending session records and API calls in IndexedDB (maximum 50 entries, FIFO eviction).
3. THE Booth SHALL flush IndexedDB entries when the network is restored, using exponential backoff (starting at 2 seconds, maximum 5 retries), flushing the session record first.
4. THE Booth SHALL display a non-blocking offline indicator (in Bahasa Indonesia, maximum 40 px height) when the network is unavailable.
5. THE Booth SHALL NOT display a frozen or blank screen in any error state; every error state SHALL include a recovery action.

---

### Requirement 14 — Privacy, Retention, and Asset Deletion

**User Story:** As an operator, I want session assets to be automatically deleted after the configured retention period so that visitor privacy is preserved.

#### Acceptance Criteria

1. THE System SHALL run a daily deletion job that removes Storage objects for sessions whose retention period has expired.
2. THE deletion job SHALL delete Storage objects via the Supabase Storage API before removing the corresponding database records.
3. THE deletion job SHALL NOT delete a database record until all associated Storage objects have been successfully deleted.
4. THE deletion job SHALL NOT delete any asset that is still referenced by a Print Job in the queued or printing state.

---

### Requirement 15 — Security

**User Story:** As an operator, I want the system to be secure so that visitor data is protected and the booth cannot be tampered with.

#### Acceptance Criteria

1. THE System SHALL use per-session tokens with entropy of at least 96 bits for all booth session authentication.
2. THE Booth SHALL route all session write operations through server-side API routes rather than direct anonymous RLS access.
3. THE System SHALL store the Supabase service role key and Gemini API key exclusively on the server side; these keys SHALL NOT appear in any client bundle.
4. THE System SHALL enforce Row-Level Security policies on all Supabase database tables.
5. THE System SHALL store all assets in private Supabase Storage buckets and serve them exclusively via signed URLs.
6. THE System SHALL generate signed upload URLs with a maximum validity of 10 minutes for iPad direct uploads to Supabase Storage.

---

### Requirement 16 — Observability and Logging

**User Story:** As an operator, I want structured logs for all key lifecycle events so that I can diagnose issues and audit system behavior.

#### Acceptance Criteria

1. THE System SHALL emit a structured JSON log entry for every session lifecycle event (created, photos captured, strip composed, uploaded, abandoned).
2. THE System SHALL emit a structured JSON log entry for every Print Job lifecycle event (created, claimed, printing, printed, failed, error reason).
3. THE System SHALL emit a structured JSON log entry for every Sketch Job lifecycle event (triggered, processing, done, failed, failed_safety, retry, daily cap reached).
4. THE System SHALL emit a structured JSON log entry for every Admin action (login, logout, lockout, event change, frame change, queue clear, reprint).

---

### Requirement 17 — Visual Style

**User Story:** As a visitor, I want a visually distinctive booth experience with a hand-drawn sketchbook aesthetic so that the rental event feels special.

#### Acceptance Criteria

1. THE Booth idle screen, booth flow chrome (frame selection, capture, preview, end screen), and Session Page SHALL use a hand-drawn / doodle sketchbook visual style with an off-white/cream background (#FDFAF3), thick uneven black SVG linework, Caveat font for headings, Inter font for body text, and #E85D26 as the primary accent color.
2. THE live camera preview, captured photos, AI Sketch content, and Admin screens SHALL NOT use the hand-drawn sketchbook style.
3. THE System SHALL respect the `prefers-reduced-motion` media query and limit or disable motion effects accordingly.
4. THE System SHALL source all Booth UI text from the single i18n file at `apps/web/i18n/id.ts` in Bahasa Indonesia.

---

### Requirement 18 — Live Photo Scaffold

**User Story:** As a visitor, I want to see the live photo section on my session page so that the feature is ready for future activation.

#### Acceptance Criteria

1. THE System SHALL include database columns for Live Photo status (pending / processing / done / failed) on the session record.
2. THE Session Page SHALL render UI states corresponding to each Live Photo status value.
3. THE System SHALL NOT implement MediaRecorder-based video encoding in the MVP; the Live Photo scaffold SHALL be UI and data-layer only.
