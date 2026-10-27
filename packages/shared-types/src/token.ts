/**
 * Generate a URL-safe session token with at least 96 bits of entropy.
 *
 * Uses `crypto.getRandomValues` for cryptographically secure randomness.
 * The 12 random bytes (96 bits) are base64url-encoded to produce a
 * 16-character string safe for use in URLs and database UNIQUE indexes.
 *
 * Property 46: Session tokens have at least 96 bits of entropy (Req 15.1)
 */
export function generateSessionToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12)); // 96 bits
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}
