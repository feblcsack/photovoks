/**
 * Optional direct Google Gemini provider (legacy). Enabled with
 * AI_PROVIDER=gemini + GEMINI_API_KEY. OpenRouter is the default.
 */
import type { AiInput, AiResult, ImageProvider } from './provider';
import { DEFAULT_GEMINI_MODEL, generateDoodle } from './gemini-client';

export const geminiProvider: ImageProvider = {
  id: 'gemini',
  isConfigured: () => Boolean(process.env.GEMINI_API_KEY),
  model: () => process.env.GEMINI_MODEL_NAME || DEFAULT_GEMINI_MODEL,
  async generate(input: AiInput): Promise<AiResult> {
    const r = await generateDoodle(input.image, input.mimeType, input.prompt, input.timeoutMs);
    if (r.ok) return { ok: true, image: r.image, mimeType: r.mimeType, model: this.model() };
    const reason = r.reason === 'gemini_error' ? 'provider_error' : r.reason;
    return { ok: false, reason, message: r.message };
  },
};
