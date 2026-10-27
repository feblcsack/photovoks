# Implementation Plan — Photovoks UI/UX Upgrade + On-Demand AI Sketch

> All changes are in `/Users/wardingtotem/Desktop/photovoks/apps/web/`.
> Verify each item with: `cd /Users/wardingtotem/Desktop/photovoks/apps/web && pnpm typecheck`
> The full project typecheck (`tsc --noEmit`) must report 0 errors after every item.

---

## Context established during exploration

- **CSS variables in scope:** `--color-bg` (`#FDFAF3`), `--color-accent` (`#E85D26`), `--color-ink` (`#1A1A1A`), `--font-display` (Caveat), `--font-body` (Inter). These are the only CSS variables to use.
- **Doodle components (read-only):** `DoodleButton` (props: `variant`, `children`, any `ButtonHTMLAttributes`), `DoodleCard` (props: `className`, `children`), `DoodleBorder` (props: `className`, `strokeColor`, `strokeWidth`, `children`). Do NOT modify these files.
- **i18n rule:** every visible string must come from `i18n/id.ts`. Add all new keys there before using them in components.
- **Route handler conventions (Next.js 16):** `context.params` is a `Promise` — must be `await`ed. Use `NextRequest`/`NextResponse` from `next/server`. Pattern already established in `app/api/sessions/[sessionId]/confirm/route.ts`.
- **Typecheck command:** `pnpm typecheck` (runs `tsc --noEmit`).
- **SketchSection current null behaviour:** when `status === null`, the component currently shows a spinner and the "pending" text — this is the state we are replacing with a "Generate" button.

---

## Item 1 — Add new i18n keys to `i18n/id.ts`

Add the following keys **before** they are referenced in any component. All keys are within the existing `id` object:

```ts
// Inside idle:
idle: {
  tapToStart: 'Ketuk untuk mulai',
  tagline: 'Abadikan momen Anda',         // ← keep existing
  title: 'Photovoks',                      // ← NEW: large brand title
  taglineUpgrade: 'Tangkap momen, simpan kenangan ✨', // ← NEW: upgraded tagline
},

// Inside frames (add one key):
frames: {
  // …existing keys kept…
  hint: 'Pilih bingkai yang kamu suka ✨', // ← NEW
},

// Inside session.sections.sketch (add two keys):
session: {
  sections: {
    sketch: {
      // …existing keys kept…
      generate: 'Buat Sketsa AI',           // ← NEW: button label
      generateHint: 'Buat sketsa artistik dari foto stripmu', // ← NEW: hint below button
    },
  },
},
```

**Files:** `i18n/id.ts`

**Important:** The `id` object uses `as const` — the new keys must be added inside the correct nested objects, not as separate top-level declarations. The type `I18n` is inferred from `typeof id`, so adding keys automatically expands it.

**Verify:** `pnpm typecheck` — 0 errors. No runtime check needed; key presence is validated by TypeScript.

---

## Item 2 — Landing page (`app/(booth)/page.tsx`): doodle decorations + brand title

Replace the file content. Keep all existing logic (`handleTap`, `dispatch`, `router`, role/tabIndex/aria, keyboard handler, `pointerEvents: 'none'` on the button). Change only the JSX layout and add decorative SVG elements.

**Layout structure (top → bottom, all inside the outer `role="button"` div):**

1. A `<div>` absolutely positioned with `pointerEvents: 'none'` that contains 6 decorative inline SVG elements scattered via `position: absolute` with individual `top`/`left`/`right` values (no external files). Include: two 4-pointed stars, one camera outline, one heart, two curved swoosh lines. Each SVG is `aria-hidden="true"`, 28–40 px wide. Apply CSS animation class `doodle-float` (keyframe: `0%,100% { transform: translateY(0) rotate(-3deg); } 50% { transform: translateY(-8px) rotate(3deg); }`, duration 3–4 s each staggered via `animationDelay`).
2. The `<style>` tag for `@keyframes doodle-float` and `@media (prefers-reduced-motion: reduce)` suppression.
3. Large `<h1>` brand title `{id.idle.title}` — font: `var(--font-display)`, size: `clamp(3rem, 10vw, 6rem)`, color: `var(--color-accent)`, `margin: 0`, `textAlign: 'center'`, `fontWeight: 700`.
4. `<p>` tagline `{id.idle.taglineUpgrade}` — font: `var(--font-display)`, size: `clamp(1.25rem, 3.5vw, 2rem)`, color: `var(--color-ink)`, `margin: 0`, `opacity: 0.85`.
5. The existing `DoodleButton` — increase `fontSize` to `clamp(1.4rem, 3.5vw, 2.2rem)` and `padding` to `'1rem 3rem'`.

The outer container keeps its existing styles plus `position: 'relative'` and `overflow: 'hidden'` (so scattered doodles don't escape the viewport).

**Files:** `app/(booth)/page.tsx`

**Verify:** `pnpm typecheck` — 0 errors.

---

## Item 3 — Consent page (`app/(booth)/consent/page.tsx`): corner doodles

Keep all existing logic and card content. Add decorative SVG elements in the four corners of the outer container:

- Wrap the outer `div` with `position: 'relative'`, `overflow: 'hidden'` (already `minHeight: '100vh'`).
- Add a single `<div aria-hidden="true" style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>` containing 4 small inline SVG shapes (star top-left, dots top-right, heart bottom-left, curved line bottom-right). Each SVG `position: absolute` at the respective corner (`top: '1.5rem', left: '1.5rem'` etc.), 24–32 px wide, `opacity: 0.35`, `stroke: 'var(--color-accent)'`, no fill.
- No animation on consent page (keep it calm/trustworthy).

**Files:** `app/(booth)/consent/page.tsx`

**Verify:** `pnpm typecheck` — 0 errors.

---

## Item 4 — Frames page (`app/(booth)/frames/page.tsx`): thumbnail width, hover animation, hint text, bigger overlay

Four targeted changes inside the existing file:

### 4a — Hint text below title
After the `<h1>` for `{id.frames.title}`, add:
```tsx
<p style={{
  fontFamily: 'var(--font-display), cursive',
  fontSize: 'clamp(1rem, 2.5vw, 1.3rem)',
  color: 'var(--color-ink)',
  opacity: 0.7,
  margin: 0,
  textAlign: 'center',
}}>
  {id.frames.hint}
</p>
```

### 4b — Doodle decoration in the header
Wrap the title `<h1>` and hint `<p>` in a `<div style={{ position: 'relative', display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>`. Add two small inline star SVGs as `aria-hidden` `position: absolute` elements at `top: '-12px', left: '-20px'` and `top: '-8px', right: '-18px'`.

### 4c — Thumbnail width 140 px + hover animation
In `FrameThumbnail`: change outer `div` `width` from `'120px'` to `'140px'`. Change inner image container `width` from `'100px'` to `'120px'`. Add hover/focus scale to the `button` element via a CSS class:

```tsx
<>
  <style>{`
    .frame-thumb-btn { transition: transform 0.18s ease; }
    .frame-thumb-btn:hover, .frame-thumb-btn:focus-visible { transform: scale(1.04); }
    @media (prefers-reduced-motion: reduce) {
      .frame-thumb-btn { transition: none !important; transform: none !important; }
    }
  `}</style>
  <button className="frame-thumb-btn" … >
```

### 4d — Preview overlay: larger frame name + bigger buttons
In `FramePreviewOverlay`:
- `<h2>` fontSize: `clamp(1.5rem, 4vw, 2.5rem)` (was `clamp(1.25rem, 3.5vw, 2rem)`).
- Confirm `DoodleButton` fontSize: `clamp(1.1rem, 3vw, 1.4rem)` (was `clamp(1rem, 2.5vw, 1.2rem)`).

**Files:** `app/(booth)/frames/page.tsx`

**Verify:** `pnpm typecheck` — 0 errors.

---

## Item 5 — `SketchSection.tsx`: add generate button for `status === null`

Update `SketchSectionProps` and the component body.

### New props interface
```ts
interface SketchSectionProps {
  status: SketchJobStatus | null;
  cardSignedUrl: string | null;
  onGenerateSketch: () => Promise<void>;   // NEW
  isGenerating: boolean;                    // NEW
}
```

### Change to the `(status === 'pending' || status === null)` block
Split this into two separate branches:

**Branch A — `status === null` (no sketch job yet):**
```tsx
{status === null && (
  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem', padding: '0.5rem 0' }}>
    <p style={{
      fontFamily: 'var(--font-body), sans-serif',
      fontSize: '0.9rem',
      color: 'var(--color-ink)',
      opacity: 0.7,
      textAlign: 'center',
      margin: 0,
    }}>
      {id.session.sections.sketch.generateHint}
    </p>
    <DoodleButton
      variant="primary"
      onClick={() => { void onGenerateSketch(); }}
      disabled={isGenerating}
      aria-busy={isGenerating}
      style={{ fontSize: '1rem', padding: '0.6rem 1.5rem', opacity: isGenerating ? 0.6 : 1 }}
    >
      {isGenerating ? id.session.sections.sketch.pending : id.session.sections.sketch.generate}
    </DoodleButton>
  </div>
)}
```

**Branch B — `status === 'pending'`** (keep existing spinner + text, remove the `|| status === null` from the condition):
```tsx
{status === 'pending' && (
  <div … >
    <SketchSpinner />
    <p … >{id.session.sections.sketch.pending}</p>
  </div>
)}
```

All other branches (`processing`, `done`, `done + no URL`) remain unchanged.

**Files:** `components/session/SketchSection.tsx`

**Verify:** `pnpm typecheck` — 0 errors.

---

## Item 6 — `confirm/route.ts`: remove auto sketch job creation

Delete the entire sketch job upsert block (lines from the comment `// ── Upsert sketch job (idempotent via UNIQUE(session_id)) ──` through the closing `}`). Also delete the `sketchJob` variable reference in the final log call and the return statement.

After the change, the function ends with:

```ts
log({
  level: 'info',
  event: 'session.composed',
  sessionId,
  details: {
    printJobId: printJob.id,
    sketchJobId: null,
  },
});

return NextResponse.json({
  printJobId: printJob.id,
  sketchJobId: null,
});
```

The JSDoc comment at the top should also be updated: remove `sketchJobId: string` from the Response line, replace with `sketchJobId: null`.

**Files:** `app/api/sessions/[sessionId]/confirm/route.ts`

**Verify:** `pnpm typecheck` — 0 errors.

---

## Item 7 — New API route: `generate-sketch/route.ts`

Create new file `app/api/sessions/[sessionId]/generate-sketch/route.ts`.

Follow the exact same structural pattern as `confirm/route.ts`: `NextRequest`, `NextResponse`, `createServerClient`, `log`, `RouteContext` type alias with awaited params.

```ts
/**
 * POST /api/sessions/[sessionId]/generate-sketch
 *
 * Creates a sketch_job record for the session, triggering async AI processing.
 * Idempotent: returns 409 if an active (non-failed) sketch job already exists.
 *
 * Auth: Bearer {sessionToken} in Authorization header
 *
 * Response 200: { sketchJobId: string }
 * Response 409: { error: 'Sketch job already exists' }
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { log } from '@/lib/logger';

type RouteContext = { params: Promise<{ sessionId: string }> };

export async function POST(
  request: NextRequest,
  context: RouteContext
): Promise<NextResponse> {
  const { sessionId } = await context.params;

  // ── Validate Bearer token ─────────────────────────────────────────────────
  const authHeader = request.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return NextResponse.json(
      { error: 'Missing or invalid Authorization header' },
      { status: 401 }
    );
  }
  const bearerToken = authHeader.slice('Bearer '.length).trim();

  const supabase = createServerClient();

  // ── Look up the session and validate token ────────────────────────────────
  const { data: session, error: sessionError } = await supabase
    .from('sessions')
    .select('id, token')
    .eq('id', sessionId)
    .single();

  if (sessionError || !session) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  }
  if (session.token !== bearerToken) {
    return NextResponse.json({ error: 'Invalid session token' }, { status: 403 });
  }

  // ── Check for existing active sketch job ─────────────────────────────────
  const { data: existingJob } = await supabase
    .from('sketch_jobs')
    .select('id, status')
    .eq('session_id', sessionId)
    .single();

  if (existingJob && existingJob.status !== 'failed' && existingJob.status !== 'failed_safety') {
    return NextResponse.json(
      { error: 'Sketch job already exists' },
      { status: 409 }
    );
  }

  // ── Upsert sketch job ─────────────────────────────────────────────────────
  const { data: sketchJob, error: sketchJobError } = await supabase
    .from('sketch_jobs')
    .upsert(
      { session_id: sessionId, status: 'pending' },
      { onConflict: 'session_id', ignoreDuplicates: false }
    )
    .select('id')
    .single();

  if (sketchJobError || !sketchJob) {
    log({
      level: 'error',
      event: 'sketch_job.create_failed',
      sessionId,
      details: { error: sketchJobError?.message },
    });
    return NextResponse.json(
      { error: 'Failed to create sketch job' },
      { status: 500 }
    );
  }

  log({
    level: 'info',
    event: 'sketch_job.requested',
    sessionId,
    details: { sketchJobId: sketchJob.id },
  });

  return NextResponse.json({ sketchJobId: sketchJob.id });
}
```

**Files:** `app/api/sessions/[sessionId]/generate-sketch/route.ts` (new file)

**Verify:** `pnpm typecheck` — 0 errors.

---

## Item 8 — `SessionView.tsx`: wire up generate-sketch + pass new props to SketchSection

Three targeted changes:

### 8a — Add `isGeneratingSketch` state
After the `sketchPrintJobStatus` state declaration:
```ts
const [isGeneratingSketch, setIsGeneratingSketch] = useState(false);
```

### 8b — Add `handleGenerateSketch` function
After the `handlePrintJobCreated` function:
```ts
const handleGenerateSketch = async (): Promise<void> => {
  setIsGeneratingSketch(true);
  try {
    const res = await fetch(`/api/sessions/${sessionId}/generate-sketch`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      // Optimistically set to pending — Realtime subscription will provide updates
      setSketchStatus('pending');
    } else {
      console.error('generate-sketch failed', res.status);
    }
  } catch (err) {
    console.error('generate-sketch error', err);
  } finally {
    setIsGeneratingSketch(false);
  }
};
```

### 8c — Update `<SketchSection />` call to pass new props
```tsx
<SketchSection
  status={sketchStatus}
  cardSignedUrl={sketchCardSignedUrl}
  onGenerateSketch={handleGenerateSketch}
  isGenerating={isGeneratingSketch}
/>
```

**Files:** `components/session/SessionView.tsx`

**Verify:** `pnpm typecheck` — 0 errors. This is the final item; run typecheck once more to confirm the full build is clean.

---

## Dependency order summary

```
Item 1 (i18n keys)
  ↓
Items 2, 3, 4  (use new idle.title, idle.taglineUpgrade, frames.hint — depend on Item 1)
  ↓
Item 5 (uses session.sections.sketch.generate + generateHint — depends on Item 1)
  ↓
Item 6 (backend: remove auto sketch creation — no component dependency, but logically before Item 7)
  ↓
Item 7 (new API route — independent of UI changes, depends only on Item 6 for the flow to be correct)
  ↓
Item 8 (wires SessionView to Item 7 + passes new props required by Item 5)
```

Items 2, 3, 4 are independent of each other and can be done in any order after Item 1.
Items 6 and 7 are independent of Items 2–5 and can be done in any order relative to them, but Item 7 must come after Item 6 so the sketch flow is coherent.
Item 8 must be the last UI change because it requires both Item 5 (new SketchSection props) and Item 7 (the endpoint) to exist first.
