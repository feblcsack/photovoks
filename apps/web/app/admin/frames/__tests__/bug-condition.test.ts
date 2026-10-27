/**
 * Bug Condition Exploration Tests — Task 1 (updated for post-fix verification in Task 3.4)
 *
 * These tests started as static analysis tests that CONFIRMED bugs on unfixed code.
 * After Task 3 fixes, they are updated to VERIFY the fixed state.
 *
 * ALL TESTS SHOULD PASS on fixed code.
 *
 * Requirements: 1.1, 1.2, 1.3 (bug confirmation) → 2.1, 2.2, 2.3 (fix verification)
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';

const WEB_ROOT = resolve(__dirname, '../../../../');

// ── Test Case A — Proxy Registered in Next.js 16 ─────────────────────────────
//
// Next.js 16 renamed "Middleware" to "Proxy". The proxy is registered via
// functions-config-manifest.json (not middleware-manifest.json).
// A `/_middleware` entry with the correct matchers proves the proxy is active.

describe('Bug Condition A — Proxy (Middleware) is registered in Next.js 16', () => {
  it('functions-config-manifest.json has a /_middleware entry (proxy is registered)', () => {
    const manifestPath = resolve(WEB_ROOT, '.next/server/functions-config-manifest.json');
    const raw = readFileSync(manifestPath, 'utf-8');
    const manifest = JSON.parse(raw) as {
      version: number;
      functions: Record<string, unknown>;
    };

    // PASSES on fixed code — proves the proxy IS registered
    expect(manifest.functions).toHaveProperty('/_middleware');
  });

  it('/_middleware matchers cover /admin and /api routes', () => {
    const manifestPath = resolve(WEB_ROOT, '.next/server/functions-config-manifest.json');
    const raw = readFileSync(manifestPath, 'utf-8');
    const manifest = JSON.parse(raw) as {
      functions: Record<string, { matchers?: Array<{ originalSource: string }> }>;
    };

    const middlewareEntry = manifest.functions['/_middleware'];
    expect(middlewareEntry).toBeDefined();
    const matchers = (middlewareEntry as { matchers?: Array<{ originalSource: string }> }).matchers ?? [];
    const sources = matchers.map((m) => m.originalSource);
    expect(sources.some((s) => s.includes('/admin'))).toBe(true);
    expect(sources.some((s) => s.includes('/api'))).toBe(true);
  });
});

// ── Test Case B — Signed URL Upsert Flag is Fixed ────────────────────────────
//
// After Task 3.2, `createSignedUploadUrl` should be called with `{ upsert: true }`.
// This allows retry uploads to existing storage paths without 500 errors.

describe('Bug Condition B — createSignedUploadUrl now uses upsert: true (FIXED)', () => {
  it('upload-url route source contains upsert: true (not upsert: false)', () => {
    const routePath = resolve(
      WEB_ROOT,
      'app/api/admin/frames/upload-url/route.ts',
    );
    const source = readFileSync(routePath, 'utf-8');

    // PASSES on fixed code — proves the upsert flag is corrected
    expect(source).toMatch(/upsert:\s*true/);
    expect(source).not.toMatch(/upsert:\s*false/);
  });
});

// ── Test Case C — proxy.ts Export Name (Next.js 16 Convention) ───────────────
//
// In Next.js 16, the proxy file must export a function named `proxy` (not `middleware`).
// proxy.ts correctly exports `proxy` — this was always correct for Next.js 16.

describe('Bug Condition C — proxy.ts exports "proxy" (correct for Next.js 16)', () => {
  it('proxy.ts exports a function named "proxy" (correct Next.js 16 convention)', () => {
    const proxyPath = resolve(WEB_ROOT, 'proxy.ts');
    const source = readFileSync(proxyPath, 'utf-8');

    // PASSES — `proxy` is the correct export name in Next.js 16
    expect(source).toMatch(/export\s+async\s+function\s+proxy\s*\(/);
  });

  it('proxy.ts has a config export with matcher covering /admin and /api', () => {
    const proxyPath = resolve(WEB_ROOT, 'proxy.ts');
    const source = readFileSync(proxyPath, 'utf-8');

    // PASSES — config export is present and correct
    expect(source).toMatch(/export\s+const\s+config/);
    expect(source).toMatch(/\/admin/);
    expect(source).toMatch(/\/api/);
  });
});
