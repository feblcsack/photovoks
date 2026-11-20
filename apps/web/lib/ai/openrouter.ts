/**
 * OpenRouter image provider (SERVER ONLY).
 *
 * Env:
 *   OPENROUTER_API_KEY   required — never exposed to the browser
 *   OPENROUTER_MODEL     optional — default "google/gemini-2.5-flash-image"
 *   OPENROUTER_API_MODE  optional — "images" (default, POST /images with
 *                        input_references) or "chat" (POST /chat/completions
 *                        with modalities ["image","text"]) for models that
 *                        only support the chat route.
 *   OPENROUTER_BASE_URL  optional — default https://openrouter.ai/api/v1
 *   APP_URL              optional — sent as HTTP-Referer for OpenRouter stats
 */
import type { AiInput, AiResult, ImageProvider } from './provider';

export const DEFAULT_OPENROUTER_MODEL = 'google/gemini-2.5-flash-image';

function baseUrl() {
  return (process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1').replace(/\/+$/, '');
}

function headers(): Record<string, string> {
  const h: Record<string, string> = {
    Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
    'Content-Type': 'application/json',
    'X-Title': 'Photovoks Photobooth',
  };
  if (process.env.APP_URL) h['HTTP-Referer'] = process.env.APP_URL;
  return h;
}

const SAFETY_RE = /(safety|moderation|content policy|prohibited|flagged|blocked)/i;

async function decodeImageRef(ref: string): Promise<{ image: Buffer; mimeType: string } | null> {
  const m = ref.match(/^data:([^;,]+);base64,(.+)$/s);
  if (m) return { image: Buffer.from(m[2], 'base64'), mimeType: m[1] };
  if (/^https:\/\//.test(ref)) {
    const res = await fetch(ref);
    if (!res.ok) return null;
    return { image: Buffer.from(await res.arrayBuffer()), mimeType: res.headers.get('content-type') || 'image/png' };
  }
  return null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function parseImagesResponse(json: any): Promise<{ image: Buffer; mimeType: string } | null> {
  const item = json?.data?.[0];
  if (!item) return null;
  if (typeof item.b64_json === 'string') {
    return { image: Buffer.from(item.b64_json, 'base64'), mimeType: item.media_type || 'image/png' };
  }
  if (typeof item.url === 'string') return decodeImageRef(item.url);
  return null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function parseChatResponse(json: any): Promise<{ image: Buffer; mimeType: string } | null> {
  const message = json?.choices?.[0]?.message;
  const candidates: string[] = [];
  for (const img of message?.images ?? []) {
    const url = img?.image_url?.url ?? img?.url;
    if (typeof url === 'string') candidates.push(url);
  }
  if (Array.isArray(message?.content)) {
    for (const part of message.content) {
      const url = part?.image_url?.url;
      if (typeof url === 'string') candidates.push(url);
    }
  }
  for (const c of candidates) {
    const decoded = await decodeImageRef(c);
    if (decoded) return decoded;
  }
  return null;
}

async function callOnce(input: AiInput, model: string, signal: AbortSignal): Promise<AiResult & { retryable?: boolean }> {
  const dataUrl = `data:${input.mimeType};base64,${input.image.toString('base64')}`;
  const mode = process.env.OPENROUTER_API_MODE === 'chat' ? 'chat' : 'images';

  const url = mode === 'chat' ? `${baseUrl()}/chat/completions` : `${baseUrl()}/images`;
  const body =
    mode === 'chat'
      ? {
          model,
          modalities: ['image', 'text'],
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: input.prompt },
                { type: 'image_url', image_url: { url: dataUrl } },
              ],
            },
          ],
        }
      : {
          model,
          prompt: input.prompt,
          n: 1,
          ...(input.aspectRatio ? { aspect_ratio: input.aspectRatio } : {}),
          input_references: [{ type: 'image_url', image_url: { url: dataUrl } }],
        };

  const res = await fetch(url, { method: 'POST', headers: headers(), body: JSON.stringify(body), signal });
  const text = await res.text();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* non-JSON error body */
  }
  const errMessage: string = json?.error?.message || (res.ok ? '' : text.slice(0, 300));

  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      return { ok: false, reason: SAFETY_RE.test(errMessage) ? 'safety' : 'auth', message: errMessage };
    }
    if (res.status === 402) return { ok: false, reason: 'insufficient_credits', message: errMessage };
    if (res.status === 429) return { ok: false, reason: 'rate_limited', message: errMessage, retryable: true };
    if (res.status === 400 || res.status === 404 || res.status === 422) {
      return { ok: false, reason: SAFETY_RE.test(errMessage) ? 'safety' : 'bad_request', message: errMessage };
    }
    return { ok: false, reason: 'provider_error', message: `${res.status} ${errMessage}`, retryable: res.status >= 500 };
  }

  if (json?.error) {
    return { ok: false, reason: SAFETY_RE.test(errMessage) ? 'safety' : 'provider_error', message: errMessage };
  }

  const parsed = mode === 'chat' ? await parseChatResponse(json) : await parseImagesResponse(json);
  if (!parsed) {
    const finish = json?.choices?.[0]?.finish_reason ?? json?.choices?.[0]?.native_finish_reason;
    if (finish && SAFETY_RE.test(String(finish))) return { ok: false, reason: 'safety', message: String(finish) };
    return { ok: false, reason: 'empty_response', message: finish ? String(finish) : undefined };
  }
  return { ok: true, image: parsed.image, mimeType: parsed.mimeType, model };
}

export const openRouterProvider: ImageProvider = {
  id: 'openrouter',
  isConfigured: () => Boolean(process.env.OPENROUTER_API_KEY),
  model: () => process.env.OPENROUTER_MODEL || DEFAULT_OPENROUTER_MODEL,
  async generate(input: AiInput): Promise<AiResult> {
    if (!process.env.OPENROUTER_API_KEY) return { ok: false, reason: 'not_configured' };
    const model = this.model();
    const deadline = Date.now() + (input.timeoutMs ?? 55_000);

    for (let attempt = 0; attempt < 2; attempt++) {
      const remaining = deadline - Date.now();
      if (remaining <= 1_000) return { ok: false, reason: 'timeout' };
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), remaining);
      try {
        const result = await callOnce(input, model, controller.signal);
        if (!result.ok && result.retryable && attempt === 0) {
          await new Promise((r) => setTimeout(r, 2_000));
          continue;
        }
        if (result.ok) return result;
        return { ok: false, reason: result.reason, message: result.message };
      } catch (err) {
        if (controller.signal.aborted) return { ok: false, reason: 'timeout' };
        if (attempt === 0) continue; // transient network error → one retry
        return { ok: false, reason: 'provider_error', message: err instanceof Error ? err.message : String(err) };
      } finally {
        clearTimeout(timer);
      }
    }
    return { ok: false, reason: 'rate_limited' };
  },
};
