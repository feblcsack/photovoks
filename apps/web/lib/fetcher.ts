/** Small JSON fetch helper for client components. Throws Error(message). */
export async function api<T = unknown>(url: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const { json, headers, ...rest } = init ?? {};
  const res = await fetch(url, {
    ...rest,
    headers: { ...(json !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(headers ?? {}) },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
    cache: 'no-store',
  });
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    /* ignore */
  }
  if (!res.ok) {
    const msg = (data as { error?: string } | null)?.error || `Permintaan gagal (${res.status})`;
    throw Object.assign(new Error(msg), { status: res.status, data });
  }
  return data as T;
}

/** Uploads a Blob to a Supabase signed upload URL. Retries transient failures. */
export async function uploadToSignedUrl(url: string, blob: Blob, contentType: string, attempts = 3): Promise<void> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, { method: 'PUT', headers: { 'Content-Type': contentType }, body: blob });
      if (res.ok) return;
      lastErr = new Error(`Upload gagal (${res.status})`);
      if (res.status < 500 && res.status !== 429) break;
    } catch (err) {
      lastErr = err;
    }
    await new Promise((r) => setTimeout(r, 800 * 2 ** i));
  }
  throw lastErr instanceof Error ? lastErr : new Error('Upload gagal');
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function timeAgo(iso: string): string {
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'baru saja';
  if (s < 3600) return `${Math.floor(s / 60)} mnt lalu`;
  if (s < 86400) return `${Math.floor(s / 3600)} jam lalu`;
  return `${Math.floor(s / 86400)} hari lalu`;
}
