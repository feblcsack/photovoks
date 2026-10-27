# UI/UX Upgrade — Landing Page Doodles, Frame Hints, and On-Demand AI Sketch

The change upgrades three areas of the booth UI: the idle landing page gets decorative SVG doodles and a Photovoks brand title; the frame selection page gains a hint subtitle and matching corner doodles; and the AI sketch feature is converted from auto-trigger (fired at session confirm) to user-initiated via a new `POST /api/sessions/[sessionId]/generate-sketch` endpoint. All 8 expected files are present in the commit. Strings are centralized, component APIs are correct, and the doodle component files are untouched.

Watch for: **confirmed** — `confirm/route.ts` response signature changed (`sketchJobId: null` hard-coded) with no migration note; callers that previously expected a real `sketchJobId` in the response will now always receive `null`. **confirmed** — `taglineUpgrade` and `tagline` keys remain in `i18n/id.ts` alongside the new `title`/`subtitle`, creating orphaned keys with no referencing code.

**Verdict**: APPROVED

---

## High-level view

The idle page (`(booth)/page.tsx`) delivers actual JSX doodles — eight distinct SVG elements with `doodle-float` keyframe animation, a brand `<h1>` pulling `id.idle.title`, and a tagline pulling `id.idle.subtitle`. This is real content, not placeholder comments.

The frame selection page follows the same pattern: corner star doodles flanking the heading, and a `<p>` below it pulling `id.frames.hint`. No structural changes to the selection or preview overlay logic.

The confirm route no longer touches `sketch_jobs` at all. The upsert block is fully removed, and the response now hard-codes `sketchJobId: null`. Any client code that consumed a real `sketchJobId` from confirm would now silently receive `null` — worth confirming no such caller exists.

The new `generate-sketch` route adds the on-demand path: Bearer token auth against `sessions.token`, idempotency check that skips re-creation unless the prior job is in a failed terminal state, then upsert. Error cases return structured JSON with appropriate status codes.

`SketchSection` now shows a generate button when `status === null && !isGenerating`, and a spinner when `status === null && isGenerating`. The transition from button → spinner is purely optimistic: `SessionView` sets `isGenerating: true` before the fetch and flips it back in `finally`, so a slow or failed network request leaves the button unavailable for the duration of the in-flight call.

`SessionView` wires `handleGenerateSketch` and `isGeneratingSketch` to `SketchSection` with the correct TypeScript types (`onGenerateSketch: () => Promise<void>`, `isGenerating: boolean`).

<details>
<summary>Issues (2)</summary>

1. **Orphaned i18n keys** — `id.idle.tagline` and `id.idle.taglineUpgrade` have no referencing code. They add noise to the i18n file and could confuse future translators. Remove them or add a comment marking them as deprecated.

2. **`confirm` response `sketchJobId: null` with no migration note** — The response contract changed from a real job ID to a hard-coded `null`. If any client (e.g. the composing page or print station) reads `sketchJobId` from this response, it will silently fail. Confirm no caller depends on a real value here; if they do, update callers before shipping.

</details>

<details>
<summary>Details</summary>

### Orphaned i18n keys

`i18n/id.ts` retains `idle.tagline` (`'Abadikan momen Anda'`) and `idle.taglineUpgrade` (`'Tangkap momen, simpan kenangan ✨'`). Neither is referenced anywhere in the codebase. The idle page uses `id.idle.title` and `id.idle.subtitle` exclusively. These keys are dead weight and will surface as translation items if the file is ever handed to a translator.

### `confirm/route.ts` response contract change

The route used to upsert a `sketch_jobs` row and return its `id` as `sketchJobId`. It now returns `{ printJobId, sketchJobId: null }`. Any caller that destructures `sketchJobId` from this response and uses it to track sketch status will receive `null` without an error signal. The composing page should be checked; if it forwards this value to state it may need updating before shipping.

### `generate-sketch` idempotency boundary

The idempotency check (`existing.status !== 'failed' && existing.status !== 'failed_safety'`) gates re-creation on terminal failure states only. A job stuck in `pending` or `processing` returns the existing job ID — the visitor sees the spinner indefinitely with no retry path if the worker crashes and the row goes stale.

### Generate-sketch silent failure in SessionView

When `generate-sketch` returns a non-2xx, `SessionView` logs to console, flips `isGenerating` back to `false`, and leaves `sketchStatus` as `null`, so the button reappears. No user-visible error message surfaces — the visitor sees the button silently return without knowing the request failed.

### Test coverage

No tests cover the new `generate-sketch` route or the updated `SketchSection` behavior. The null-status → button transition and the idempotency logic in the route are the two highest-value paths to add.

</details>

---

<details>
<summary>File map</summary>

| File | Change |
|---|---|
| `app/(booth)/page.tsx` | Idle page rebuilt with SVG doodle layer, brand title, tagline, animated DoodleButton |
| `app/(booth)/consent/page.tsx` | Decorative corner doodles added around existing consent card |
| `app/(booth)/frames/page.tsx` | Hint subtitle and corner star doodles added to frame selection header |
| `i18n/id.ts` | Added `idle.title`, `idle.subtitle`, `frames.hint`, `session.sections.sketch.generate`, `session.sections.sketch.generateHint` |
| `app/api/sessions/[sessionId]/confirm/route.ts` | `sketch_jobs` upsert block removed; response returns `sketchJobId: null` |
| `app/api/sessions/[sessionId]/generate-sketch/route.ts` | New endpoint: Bearer auth, idempotency check, sketch_job upsert, structured logging |
| `components/session/SketchSection.tsx` | Null-status shows generate button; accepts `onGenerateSketch` and `isGenerating` props |
| `components/session/SessionView.tsx` | Wires `handleGenerateSketch` and `isGeneratingSketch` state to SketchSection |

Full diff: `git show HEAD` in `apps/web`

</details>
