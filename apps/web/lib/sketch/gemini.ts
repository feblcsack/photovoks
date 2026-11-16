/**
 * Gemini doodle generator (SERVER ONLY).
 *
 * Sends one photo + prompt to a Gemini image model and returns the generated
 * image. Retries once on 429 and aborts after `timeoutMs`.
 *
 * Env:
 *   GEMINI_API_KEY      (required)
 *   GEMINI_MODEL_NAME   (optional, default "gemini-2.5-flash-image")
 */
import { ApiError, FinishReason, GoogleGenAI } from '@google/genai';

export const DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash-image';

/** Fallback prompt used when an event has no active prompt template. */
export const DEFAULT_DOODLE_PROMPT =
  'Redraw this photo as a playful hand-drawn doodle illustration: bold black ink ' +
  'outlines, simple cute shapes, light pastel accents, white paper background, ' +
  'small doodle decorations (hearts, stars, sparkles) around the people. ' +
  "Keep every person's pose, expression, hairstyle and clothing recognisable. " +
  'Portrait orientation (1:3 tall strip). Do not add any text or watermark.';

export type DoodleResult =
  | { ok: true; image: Buffer; mimeType: string }
  | {
      ok: false;
      reason:
        | 'not_configured'
        | 'safety'
        | 'rate_limited'
        | 'timeout'
        | 'empty_response'
        | 'gemini_error';
      message?: string;
    };

const SAFETY_REASONS = new Set<string>([
  FinishReason.SAFETY,
  FinishReason.PROHIBITED_CONTENT,
  FinishReason.SPII,
  FinishReason.BLOCKLIST,
  FinishReason.IMAGE_SAFETY,
  FinishReason.IMAGE_PROHIBITED_CONTENT,
]);

export function isGeminiConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY);
}

export async function generateDoodle(
  photo: Buffer,
  photoMimeType: string,
  prompt: string,
  timeoutMs = 55_000,
): Promise<DoodleResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return { ok: false, reason: 'not_configured' };

  const ai = new GoogleGenAI({ apiKey });
  const model = process.env.GEMINI_MODEL_NAME || DEFAULT_GEMINI_MODEL;
  const deadline = Date.now() + timeoutMs;

  for (let attempt = 0; attempt < 2; attempt++) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) return { ok: false, reason: 'timeout' };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), remaining);
    try {
      const response = await ai.models.generateContent({
        model,
        contents: [
          {
            role: 'user',
            parts: [
              { inlineData: { mimeType: photoMimeType, data: photo.toString('base64') } },
              { text: prompt },
            ],
          },
        ],
        config: { abortSignal: controller.signal },
      });

      if (response.promptFeedback?.blockReason) return { ok: false, reason: 'safety' };

      const candidate = response.candidates?.[0];
      if (candidate?.finishReason && SAFETY_REASONS.has(candidate.finishReason)) {
        return { ok: false, reason: 'safety' };
      }

      for (const part of candidate?.content?.parts ?? []) {
        if (part.inlineData?.data) {
          return {
            ok: true,
            image: Buffer.from(part.inlineData.data, 'base64'),
            mimeType: part.inlineData.mimeType ?? 'image/png',
          };
        }
      }
      return { ok: false, reason: 'empty_response', message: candidate?.finishReason };
    } catch (err) {
      if (controller.signal.aborted) return { ok: false, reason: 'timeout' };
      if (err instanceof ApiError && err.status === 429) {
        if (attempt === 0) {
          await new Promise((r) => setTimeout(r, 2_000));
          continue;
        }
        return { ok: false, reason: 'rate_limited' };
      }
      return {
        ok: false,
        reason: 'gemini_error',
        message: err instanceof Error ? err.message : String(err),
      };
    } finally {
      clearTimeout(timer);
    }
  }
  return { ok: false, reason: 'rate_limited' };
}
