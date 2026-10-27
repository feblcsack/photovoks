/**
 * POST /api/admin/prompts/preview
 *
 * Admin-only endpoint that submits a test photo through the Gemini sketch
 * generation pipeline and returns the resulting sketch image inline as a
 * base64-encoded PNG. Nothing is persisted to the database or Storage.
 *
 * Request: multipart/form-data
 *   - photo: File   (JPEG or PNG image)
 *   - content: string  (prompt text to test)
 *
 * Response: { imageBase64: string, mimeType: string } on success
 *
 * Protected by admin JWT middleware.
 * Requirements: 11.6
 */
import { NextRequest, NextResponse } from 'next/server';
import {
  GoogleGenerativeAI,
  FinishReason,
  GoogleGenerativeAIFetchError,
} from '@google/generative-ai';

// Vercel: allow up to 60 seconds for this preview route
export const maxDuration = 60;

function getEnv(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`Missing required environment variable: ${key}`);
  return value;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  // ── Parse multipart form data ──────────────────────────────────────────────
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Expected multipart/form-data body' }, { status: 400 });
  }

  const photoFile = formData.get('photo');
  const promptContent = formData.get('content');

  if (!photoFile || !(photoFile instanceof File)) {
    return NextResponse.json({ error: 'photo file is required' }, { status: 400 });
  }

  if (!promptContent || typeof promptContent !== 'string' || !promptContent.trim()) {
    return NextResponse.json({ error: 'content (prompt text) is required' }, { status: 400 });
  }

  // ── Validate file type ────────────────────────────────────────────────────
  const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
  const fileType = photoFile.type || 'image/jpeg';
  if (!allowedTypes.includes(fileType)) {
    return NextResponse.json(
      { error: 'Photo must be a JPEG, PNG, or WebP image' },
      { status: 400 }
    );
  }

  // ── Convert File → base64 ─────────────────────────────────────────────────
  const photoArrayBuffer = await photoFile.arrayBuffer();
  const photoBuffer = Buffer.from(photoArrayBuffer);
  const photoBase64 = photoBuffer.toString('base64');

  // ── Call Gemini API ───────────────────────────────────────────────────────
  let geminiModelName: string;
  let geminiApiKey: string;

  try {
    geminiModelName = getEnv('GEMINI_MODEL_NAME');
    geminiApiKey = getEnv('GEMINI_API_KEY');
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(
      JSON.stringify({
        ts: new Date().toISOString(),
        level: 'error',
        event: 'admin.prompts.preview_failed',
        details: { reason: 'missing_env', error: msg },
      })
    );
    return NextResponse.json({ error: 'Gemini API not configured on server' }, { status: 500 });
  }

  const genAI = new GoogleGenerativeAI(geminiApiKey);
  const model = genAI.getGenerativeModel({ model: geminiModelName });

  const startMs = Date.now();
  const TIMEOUT_GUARD_MS = 55_000;
  let attempt = 0;

  while (attempt < 2) {
    if (Date.now() - startMs > TIMEOUT_GUARD_MS) {
      return NextResponse.json({ error: 'Gemini API timed out' }, { status: 504 });
    }

    try {
      const result = await model.generateContent([
        {
          inlineData: {
            mimeType: fileType as 'image/jpeg' | 'image/png' | 'image/webp',
            data: photoBase64,
          },
        },
        { text: promptContent.trim() },
      ]);

      const response = result.response;

      // Safety block on prompt
      if (response.promptFeedback?.blockReason) {
        return NextResponse.json(
          {
            error: `Prompt was blocked by safety filter: ${response.promptFeedback.blockReason}`,
            code: 'SAFETY_BLOCKED',
          },
          { status: 422 }
        );
      }

      const candidate = response.candidates?.[0];

      // Safety block on response
      if (
        candidate?.finishReason === FinishReason.SAFETY ||
        candidate?.finishReason === FinishReason.PROHIBITED_CONTENT ||
        candidate?.finishReason === FinishReason.SPII
      ) {
        return NextResponse.json(
          {
            error: `Response blocked by safety filter: ${candidate.finishReason}`,
            code: 'SAFETY_BLOCKED',
          },
          { status: 422 }
        );
      }

      // Extract image from response parts
      const parts = candidate?.content?.parts ?? [];
      let imageBase64: string | null = null;
      let imageMimeType = 'image/png';

      for (const part of parts) {
        if ('inlineData' in part && part.inlineData) {
          imageBase64 = part.inlineData.data;
          imageMimeType = part.inlineData.mimeType;
          break;
        }
      }

      if (!imageBase64) {
        return NextResponse.json(
          { error: 'Gemini returned no image data. Try a different prompt or photo.' },
          { status: 422 }
        );
      }

      console.log(
        JSON.stringify({
          ts: new Date().toISOString(),
          level: 'info',
          event: 'admin.prompt_template.preview_generated',
          details: { modelName: geminiModelName, elapsedMs: Date.now() - startMs },
        })
      );

      return NextResponse.json({ imageBase64, mimeType: imageMimeType });
    } catch (err: unknown) {
      const elapsed = Date.now() - startMs;

      if (elapsed > TIMEOUT_GUARD_MS) {
        return NextResponse.json({ error: 'Gemini API timed out' }, { status: 504 });
      }

      // 429 — retry once after 2 s
      if (err instanceof GoogleGenerativeAIFetchError && err.status === 429) {
        if (attempt === 0) {
          await new Promise((resolve) => setTimeout(resolve, 2_000));
          attempt++;
          continue;
        }
        return NextResponse.json(
          { error: 'Gemini API rate limit exceeded. Please try again shortly.' },
          { status: 429 }
        );
      }

      const message = err instanceof Error ? err.message : String(err);
      console.error(
        JSON.stringify({
          ts: new Date().toISOString(),
          level: 'error',
          event: 'admin.prompts.preview_failed',
          details: { reason: 'gemini_error', error: message },
        })
      );
      return NextResponse.json(
        { error: `Gemini API error: ${message}` },
        { status: 500 }
      );
    }
  }

  return NextResponse.json({ error: 'Gemini API failed after retry' }, { status: 500 });
}
