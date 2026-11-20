/**
 * AI image provider abstraction (SERVER ONLY).
 *
 * Default provider: OpenRouter (any image model, chosen with OPENROUTER_MODEL).
 * Legacy provider:  Google Gemini direct (AI_PROVIDER=gemini + GEMINI_API_KEY).
 *
 * To add a provider: implement `ImageProvider` and register it in PROVIDERS.
 */
import { openRouterProvider } from './openrouter';
import { geminiProvider } from './gemini';

export type AiFailureReason =
  | 'not_configured'
  | 'auth'
  | 'insufficient_credits'
  | 'safety'
  | 'rate_limited'
  | 'timeout'
  | 'empty_response'
  | 'bad_request'
  | 'provider_error';

export type AiResult =
  | { ok: true; image: Buffer; mimeType: string; model: string }
  | { ok: false; reason: AiFailureReason; message?: string };

export interface AiInput {
  image: Buffer;
  mimeType: string;
  prompt: string;
  /** Hint like "3:4" — providers may ignore it. */
  aspectRatio?: string;
  timeoutMs?: number;
}

export interface ImageProvider {
  id: string;
  isConfigured(): boolean;
  model(): string;
  generate(input: AiInput): Promise<AiResult>;
}

const PROVIDERS: Record<string, ImageProvider> = {
  openrouter: openRouterProvider,
  gemini: geminiProvider,
};

export function getProvider(): ImageProvider {
  const id = (process.env.AI_PROVIDER || 'openrouter').toLowerCase();
  return PROVIDERS[id] ?? openRouterProvider;
}

export function isAiConfigured(): boolean {
  return getProvider().isConfigured();
}

/** Human readable (Indonesian) explanation for a failure reason. */
export function describeAiFailure(reason: string | null | undefined): string {
  switch (reason) {
    case 'not_configured':
      return 'AI belum dikonfigurasi (API key belum diisi).';
    case 'auth':
      return 'API key AI ditolak. Periksa OPENROUTER_API_KEY.';
    case 'insufficient_credits':
      return 'Saldo/kredit OpenRouter habis.';
    case 'safety':
    case 'failed_safety':
      return 'Foto ditolak oleh filter keamanan AI. Coba foto lain.';
    case 'rate_limited':
      return 'AI sedang sibuk. Coba lagi sebentar lagi.';
    case 'timeout':
      return 'AI terlalu lama merespons. Coba lagi.';
    case 'daily_cap_reached':
      return 'Batas harian AI untuk event ini sudah tercapai.';
    case 'empty_response':
      return 'Model tidak mengembalikan gambar. Coba gaya lain atau model lain.';
    case 'bad_request':
      return 'Permintaan ditolak model (model mungkin tidak mendukung input gambar).';
    default:
      return 'Gagal membuat gambar AI. Coba lagi.';
  }
}
