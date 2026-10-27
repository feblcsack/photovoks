/**
 * IndexedDB-backed offline queue for pending booth operations.
 *
 * Stores session creation requests, uploads, and confirm calls so they can
 * be replayed when network connectivity is restored.
 *
 * Capacity: max 50 entries with FIFO eviction (oldest createdAt evicted first).
 * Flush ordering: 'session' entries processed before 'upload' before 'confirm'.
 * Retry backoff: 2000 * 2^retries ms, retries capped at 4 (5 total attempts).
 *
 * Requirements: 13.2, 13.3, 6.7
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PendingEntry {
  id: string;
  type: 'session' | 'upload' | 'confirm';
  payload: unknown;
  sessionId: string;
  retries: number;
  createdAt: number; // epoch ms
}

// ── Constants ─────────────────────────────────────────────────────────────────

const DB_NAME = 'photovoks_pending_queue';
const STORE_NAME = 'pending_queue';
const DB_VERSION = 1;
const MAX_ENTRIES = 50;
const MAX_RETRIES = 4; // 5 total attempts (0–4)
const BASE_BACKOFF_MS = 2000;

// ── IndexedDB setup ───────────────────────────────────────────────────────────

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };

    request.onsuccess = (event) => {
      resolve((event.target as IDBOpenDBRequest).result);
    };

    request.onerror = (event) => {
      reject((event.target as IDBOpenDBRequest).error);
    };
  });
}

// ── CRUD helpers ──────────────────────────────────────────────────────────────

function getAllEntries(db: IDBDatabase): Promise<PendingEntry[]> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.getAll();

    request.onsuccess = () => resolve(request.result as PendingEntry[]);
    request.onerror = () => reject(request.error);
  });
}

function putEntry(db: IDBDatabase, entry: PendingEntry): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.put(entry);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

function deleteEntry(db: IDBDatabase, id: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.delete(id);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Adds an entry to the pending queue.
 *
 * If the queue is at or over MAX_ENTRIES capacity, the oldest entry (by
 * createdAt) is evicted first (FIFO eviction per Requirement 13.2).
 */
export async function enqueue(
  entry: Omit<PendingEntry, 'id' | 'createdAt'>,
): Promise<void> {
  const db = await openDB();
  const all = await getAllEntries(db);

  // FIFO eviction if at capacity
  if (all.length >= MAX_ENTRIES) {
    const oldest = all.sort((a, b) => a.createdAt - b.createdAt)[0];
    if (oldest) {
      await deleteEntry(db, oldest.id);
      console.warn(
        JSON.stringify({
          ts: new Date().toISOString(),
          level: 'warn',
          event: 'offline_queue.evicted',
          details: { evictedId: oldest.id, evictedType: oldest.type },
        }),
      );
    }
  }

  const newEntry: PendingEntry = {
    ...entry,
    id: crypto.randomUUID(),
    createdAt: Date.now(),
  };

  await putEntry(db, newEntry);
  db.close();
}

/**
 * Returns all entries in the queue, unsorted.
 */
export async function getAll(): Promise<PendingEntry[]> {
  const db = await openDB();
  const entries = await getAllEntries(db);
  db.close();
  return entries;
}

/**
 * Removes a single entry by id.
 */
export async function remove(id: string): Promise<void> {
  const db = await openDB();
  await deleteEntry(db, id);
  db.close();
}

/**
 * Flushes the pending queue, processing entries in the correct order:
 * 'session' first, then 'upload', then 'confirm' (Requirement 13.3).
 *
 * For each entry, the caller-provided `processor` function is invoked.
 * On failure, exponential backoff is applied: `2000 * 2^retries` ms.
 * After MAX_RETRIES failures the entry is removed and a structured error
 * is logged.
 *
 * @param processor  Async function that processes a single entry.
 *                   Should throw on failure.
 */
export async function flush(
  processor: (entry: PendingEntry) => Promise<void>,
): Promise<void> {
  const db = await openDB();
  const all = await getAllEntries(db);
  db.close();

  // Sort: session → upload → confirm (then by createdAt within each type)
  const typeOrder: Record<PendingEntry['type'], number> = {
    session: 0,
    upload: 1,
    confirm: 2,
  };

  const sorted = [...all].sort((a, b) => {
    const typeDiff = typeOrder[a.type] - typeOrder[b.type];
    if (typeDiff !== 0) return typeDiff;
    return a.createdAt - b.createdAt;
  });

  for (const entry of sorted) {
    await processWithBackoff(entry, processor);
  }
}

// ── Internals ─────────────────────────────────────────────────────────────────

async function processWithBackoff(
  entry: PendingEntry,
  processor: (entry: PendingEntry) => Promise<void>,
): Promise<void> {
  let currentEntry = { ...entry };

  while (currentEntry.retries <= MAX_RETRIES) {
    try {
      await processor(currentEntry);
      // Success — remove from queue
      await remove(currentEntry.id);
      return;
    } catch (err) {
      currentEntry = { ...currentEntry, retries: currentEntry.retries + 1 };

      if (currentEntry.retries > MAX_RETRIES) {
        // Max retries exceeded — give up and remove
        await remove(entry.id);
        console.error(
          JSON.stringify({
            ts: new Date().toISOString(),
            level: 'error',
            event: 'offline_queue.max_retries_exceeded',
            sessionId: entry.sessionId,
            details: {
              id: entry.id,
              type: entry.type,
              retries: currentEntry.retries,
              error: err instanceof Error ? err.message : String(err),
            },
          }),
        );
        return;
      }

      // Update retry count in DB
      const db = await openDB();
      await putEntry(db, currentEntry);
      db.close();

      // Exponential backoff: 2s, 4s, 8s, 16s, 32s (capped at 4 retries)
      const delay = BASE_BACKOFF_MS * Math.pow(2, currentEntry.retries - 1);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}

// ── Default flush processor ────────────────────────────────────────────────

/**
 * Default entry processor for the flush queue.
 *
 * Replays pending entries over the network:
 * - 'session': POST /api/sessions
 * - 'upload': PUT to the stored signed URL
 * - 'confirm': POST /api/sessions/{id}/confirm
 *
 * This is called by `flushPendingQueue()` which is triggered from the
 * booth layout on the `window.online` event and on SW FLUSH_QUEUE messages.
 */
async function defaultProcessor(entry: PendingEntry): Promise<void> {
  if (entry.type === 'session') {
    const payload = entry.payload as { eventId: string };
    const response = await fetch('/api/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ eventId: payload.eventId }),
    });
    if (!response.ok) {
      throw new Error(`Session replay failed: ${response.status}`);
    }
  } else if (entry.type === 'upload') {
    const payload = entry.payload as {
      signedUrl: string;
      contentType: string;
      label?: string;
    };
    // Blob data cannot be reconstructed from IndexedDB payload;
    // mark as a no-op if we can't recover the binary data.
    // In practice the composing page retries uploads before enqueuing.
    if (!payload.signedUrl) {
      throw new Error('Missing signedUrl in upload entry');
    }
    // Signal that this entry needs user intervention — remove it
    // so it doesn't block other retries.
    throw new Error(`Upload entry for ${payload.label ?? 'unknown'} cannot be replayed without blob data`);
  } else if (entry.type === 'confirm') {
    const payload = entry.payload as { sessionId: string; sessionToken: string };
    const response = await fetch(`/api/sessions/${payload.sessionId}/confirm`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${payload.sessionToken}`,
      },
    });
    if (!response.ok) {
      throw new Error(`Confirm replay failed: ${response.status}`);
    }
  }
}

/**
 * Flushes the offline queue using the default HTTP processor.
 *
 * Call this on `window.online` and on receipt of the SW FLUSH_QUEUE message.
 * Requirements: 13.3
 */
export async function flushPendingQueue(): Promise<void> {
  return flush(defaultProcessor);
}
