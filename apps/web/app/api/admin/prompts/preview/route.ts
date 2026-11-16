/**
 * POST /api/admin/prompts/preview  (admin only)
 *
 * Runs a test photo through the Gemini doodle pipeline and returns the result
 * inline as base64. Nothing is persisted.
 *
 * Request: multipart/form-data — photo: File, content: string (prompt)
 * Response: { imageBase64, mimeType }
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/security';
import { generateDoodle } from '@/lib/sketch/gemini';

export const maxDuration = 60;

const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
const MAX_PROMPT_CHARS = 4000;
const ALLOWED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];

const ERROR_MESSAGES: Record<string, [string, number]> = {
  not_configured: ['GEMINI_API_KEY belum diisi di server', 500],
  safety: ['Foto/prompt ditolak oleh filter keamanan Gemini', 422],
  rate_limited: ['Kuota Gemini habis sementara (429). Coba lagi sebentar.', 429],
  timeout: ['Gemini terlalu lama merespons', 504],
  empty_response: ['Gemini tidak mengembalikan gambar. Pastikan model mendukung output gambar.', 502],
  gemini_error: ['Gagal memanggil Gemini', 502],
};

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await requireAdmin();
  if (denied) return denied;

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
  if (typeof promptContent !== 'string' || !promptContent.trim()) {
    return NextResponse.json({ error: 'content (prompt text) is required' }, { status: 400 });
  }
  if (promptContent.length > MAX_PROMPT_CHARS) {
    return NextResponse.json({ error: 'Prompt terlalu panjang' }, { status: 400 });
  }
  const fileType = photoFile.type || 'image/jpeg';
  if (!ALLOWED_TYPES.includes(fileType)) {
    return NextResponse.json({ error: 'Photo must be a JPEG, PNG, or WebP image' }, { status: 400 });
  }
  if (photoFile.size > MAX_PHOTO_BYTES) {
    return NextResponse.json({ error: 'Foto maksimal 10 MB' }, { status: 413 });
  }

  const photo = Buffer.from(await photoFile.arrayBuffer());
  const result = await generateDoodle(photo, fileType === 'image/jpg' ? 'image/jpeg' : fileType, promptContent);

  if (!result.ok) {
    const [message, status] = ERROR_MESSAGES[result.reason] ?? ['Gagal', 500];
    return NextResponse.json({ error: message }, { status });
  }

  return NextResponse.json({
    imageBase64: result.image.toString('base64'),
    mimeType: result.mimeType,
  });
}
