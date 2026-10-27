/**
 * Photovoks Service Worker
 *
 * Caching strategies (matching Workbox patterns):
 *   - Cache-first: /_next/static/**, /fonts/**, /frames/** (event-keyed: frames-v1)
 *   - Network-first: /api/**
 *   - Cache-first (shell): all other navigation requests (booth UI shell)
 *
 * Also handles:
 *   - FLUSH_QUEUE message from the main app → posts FLUSH_QUEUE to all clients
 *   - 'online' event (not reliable in SW, main app also handles this)
 *
 * Requirements: 13.1
 */

const STATIC_CACHE = 'photovoks-static-v1';
const FRAMES_CACHE = 'frames-v1';
const SHELL_CACHE = 'photovoks-shell-v1';

// ── Install: precache the booth UI shell ──────────────────────────────────────

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) =>
        cache.addAll([
          '/',
          '/consent',
          '/frames',
          '/capture',
          '/preview',
          '/composing',
          '/end',
        ]).catch(() => {
          // Precaching booth routes may fail in dev; continue regardless
        })
      )
      .then(() => self.skipWaiting())
  );
});

// ── Activate: claim all clients, clean old caches ─────────────────────────────

self.addEventListener('activate', (event) => {
  const VALID_CACHES = [STATIC_CACHE, FRAMES_CACHE, SHELL_CACHE];

  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => !VALID_CACHES.includes(key))
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

// ── Fetch: apply caching strategies ──────────────────────────────────────────

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle same-origin GET requests
  if (request.method !== 'GET' || url.origin !== self.location.origin) {
    return;
  }

  const pathname = url.pathname;

  // ── Network-first: API routes ─────────────────────────────────────────────
  if (pathname.startsWith('/api/')) {
    event.respondWith(networkFirst(request, STATIC_CACHE));
    return;
  }

  // ── Cache-first: Next.js static assets ───────────────────────────────────
  if (pathname.startsWith('/_next/static/')) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }

  // ── Cache-first: fonts ────────────────────────────────────────────────────
  if (pathname.startsWith('/fonts/')) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }

  // ── Cache-first: frame images ─────────────────────────────────────────────
  if (pathname.startsWith('/frames/')) {
    event.respondWith(cacheFirst(request, FRAMES_CACHE));
    return;
  }

  // ── Cache-first with network fallback: booth UI shell (navigation) ────────
  if (request.mode === 'navigate' || request.headers.get('accept')?.includes('text/html')) {
    event.respondWith(shellFirst(request));
    return;
  }
});

// ── Strategy: cache-first ─────────────────────────────────────────────────────

/**
 * Serves from cache if available; falls through to network on miss and
 * stores the response in the given cache for next time.
 */
async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response('Network error', { status: 503, statusText: 'Service Unavailable' });
  }
}

// ── Strategy: network-first ───────────────────────────────────────────────────

/**
 * Tries the network first; falls back to cache on failure.
 * Caches successful responses for offline access.
 */
async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);

  try {
    const response = await fetch(request);
    if (response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;
    return new Response(JSON.stringify({ error: 'offline' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

// ── Strategy: shell-first (navigation) ───────────────────────────────────────

/**
 * For navigation requests: tries cache (shell), falls back to network,
 * then tries to return the cached '/' shell for client-side navigation.
 */
async function shellFirst(request) {
  const cache = await caches.open(SHELL_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    // Offline: return cached shell root so React can handle routing
    const shell = await cache.match('/');
    if (shell) return shell;
    return new Response('Offline', { status: 503 });
  }
}

// ── Message handler: FLUSH_QUEUE ──────────────────────────────────────────────

/**
 * When the main app posts FLUSH_QUEUE (e.g. on SW activation), we relay
 * the message to all active window clients so they can flush IndexedDB.
 * The actual flush logic lives in the main app (lib/offline/queue.ts).
 */
self.addEventListener('message', (event) => {
  if (event.data === 'FLUSH_QUEUE') {
    self.clients.matchAll({ type: 'window' }).then((clients) => {
      for (const client of clients) {
        client.postMessage('FLUSH_QUEUE');
      }
    });
  }
});
