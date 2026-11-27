/**
 * Minimal AWS Signature V4 for S3-compatible storage (Cloudflare R2, MinIO,
 * Backblaze B2, Wasabi, any VPS running an S3 API). SERVER ONLY.
 * Implemented with node:crypto so no extra dependency is needed.
 */
import { createHash, createHmac } from 'node:crypto';

export interface S3Credentials {
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
}

const UNSIGNED = 'UNSIGNED-PAYLOAD';

/** RFC 3986 encoding as required by SigV4. */
export function rfc3986(s: string): string {
  return encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

function canonicalPath(pathname: string): string {
  return pathname
    .split('/')
    .map((seg) => rfc3986(decodeURIComponent(seg)))
    .join('/');
}

function canonicalQuery(params: URLSearchParams): string {
  return Array.from(params.entries())
    .map(([k, v]) => [rfc3986(k), rfc3986(v)] as const)
    .sort(([a, av], [b, bv]) => (a === b ? (av < bv ? -1 : 1) : a < b ? -1 : 1))
    .map(([k, v]) => `${k}=${v}`)
    .join('&');
}

const sha256hex = (data: string | Buffer) => createHash('sha256').update(data).digest('hex');
const hmac = (key: Buffer | string, data: string) => createHmac('sha256', key).update(data).digest();

function amzDate(now: Date) {
  const iso = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  return { stamp: iso, day: iso.slice(0, 8) };
}

function signingKey(secret: string, day: string, region: string) {
  return hmac(hmac(hmac(hmac(`AWS4${secret}`, day), region), 's3'), 'aws4_request');
}

/** Signs a request with headers. Returns the headers to send. */
export function signHeaders(
  creds: S3Credentials,
  method: string,
  url: URL,
  headers: Record<string, string> = {},
  body?: Buffer | string | null,
  now = new Date(),
): Record<string, string> {
  const { stamp, day } = amzDate(now);
  const payloadHash = body == null ? sha256hex('') : sha256hex(body);
  const all: Record<string, string> = {
    ...Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), String(v).trim()])),
    host: url.host,
    'x-amz-date': stamp,
    'x-amz-content-sha256': payloadHash,
  };
  const names = Object.keys(all).sort();
  const canonicalHeaders = names.map((n) => `${n}:${all[n]}\n`).join('');
  const signed = names.join(';');
  const canonical = [method, canonicalPath(url.pathname), canonicalQuery(url.searchParams), canonicalHeaders, signed, payloadHash].join('\n');
  const scope = `${day}/${creds.region}/s3/aws4_request`;
  const toSign = ['AWS4-HMAC-SHA256', stamp, scope, sha256hex(canonical)].join('\n');
  const signature = createHmac('sha256', signingKey(creds.secretAccessKey, day, creds.region)).update(toSign).digest('hex');
  const out: Record<string, string> = { ...all };
  delete out.host;
  out.authorization = `AWS4-HMAC-SHA256 Credential=${creds.accessKeyId}/${scope}, SignedHeaders=${signed}, Signature=${signature}`;
  return out;
}

/** Pre-signed URL (query auth) — used for browser uploads and video redirects. */
export function presignUrl(creds: S3Credentials, method: 'GET' | 'PUT', url: URL, expiresSeconds: number, now = new Date()): string {
  const { stamp, day } = amzDate(now);
  const scope = `${day}/${creds.region}/s3/aws4_request`;
  const u = new URL(url.toString());
  u.searchParams.set('X-Amz-Algorithm', 'AWS4-HMAC-SHA256');
  u.searchParams.set('X-Amz-Credential', `${creds.accessKeyId}/${scope}`);
  u.searchParams.set('X-Amz-Date', stamp);
  u.searchParams.set('X-Amz-Expires', String(Math.min(604800, Math.max(1, Math.round(expiresSeconds)))));
  u.searchParams.set('X-Amz-SignedHeaders', 'host');
  const canonical = [method, canonicalPath(u.pathname), canonicalQuery(u.searchParams), `host:${u.host}\n`, 'host', UNSIGNED].join('\n');
  const toSign = ['AWS4-HMAC-SHA256', stamp, scope, sha256hex(canonical)].join('\n');
  const signature = createHmac('sha256', signingKey(creds.secretAccessKey, day, creds.region)).update(toSign).digest('hex');
  u.searchParams.set('X-Amz-Signature', signature);
  return u.toString();
}
