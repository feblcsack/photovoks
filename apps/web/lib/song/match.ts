/**
 * Tebak Lagu helpers (client + server safe): Spotify link parsing and
 * forgiving answer matching (case, accents, punctuation, "feat."/"(Remix)",
 * small typos).
 */

/** Track id from open.spotify.com/(intl-xx/)track/<id>, spotify:track:<id> or a bare id. */
export function parseSpotifyTrackId(input: string): string | null {
  const s = input.trim();
  const m = /(?:open\.spotify\.com\/(?:intl-[a-z]{2}\/)?(?:embed\/)?track\/|spotify:track:)([A-Za-z0-9]{22})/.exec(s);
  if (m) return m[1];
  return /^[A-Za-z0-9]{22}$/.test(s) ? s : null;
}

export function spotifyEmbedUrl(id: string): string {
  return `https://open.spotify.com/embed/track/${id}?utm_source=generator&theme=0`;
}

/** Lowercase, strip accents, brackets, "feat. …", " - Remastered…", punctuation. */
export function normalizeTitle(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\(.*?\)|\[.*?\]/g, ' ')
    .replace(/\s[-–—]\s.*$/, ' ')
    .replace(/\b(feat|ft|featuring)\b.*$/, ' ')
    .replace(/&/g, ' dan ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return prev[b.length];
}

/** True when the guess matches the title or an alias (typo-tolerant). */
export function isCorrectGuess(guess: string, title: string, aliases: string[] = []): boolean {
  const g = normalizeTitle(guess);
  if (g.length < 2) return false;
  for (const answer of [title, ...aliases]) {
    const a = normalizeTitle(answer);
    if (!a) continue;
    if (g === a) return true;
    // allow ~1 typo per 5 letters
    const allowed = Math.floor(a.length / 5);
    if (allowed > 0 && levenshtein(g, a) <= allowed) return true;
    // "never gonna give you up rick astley" contains the full title
    if (a.length >= 4 && (` ${g} `).includes(` ${a} `)) return true;
  }
  return false;
}

/** Voucher code like LAGU-7KQ2 (no ambiguous characters). */
export function voucherCode(rand: () => number = Math.random): string {
  const A = 'ACDEFHJKMNPRTUVWXY34679';
  return `LAGU-${Array.from({ length: 4 }, () => A[Math.floor(rand() * A.length)]).join('')}`;
}
