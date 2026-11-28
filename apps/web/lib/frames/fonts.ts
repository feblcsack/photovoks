/**
 * Font registry for the frame renderer. Canvas cannot read CSS variables, so
 * we pass the real (hashed) family names produced by next/font.
 */
import { anton, archivoBlack, bagel, bebas, caveat, gochi, grenze, instrument, jacquard, jakarta, nunito, orbitron, pacifico, patrickHand, playfair, spaceMono, specialElite, unifraktur } from '@/app/fonts';
import type { FontKey } from './types';

export const FONTS: Record<FontKey, { label: string; family: string; weights: number[] }> = {
  sans: { label: 'Sans (Jakarta)', family: jakarta.style.fontFamily, weights: [400, 500, 600, 700, 800] },
  serif: { label: 'Serif (Playfair)', family: playfair.style.fontFamily, weights: [400, 700, 800] },
  mono: { label: 'Mono / Struk', family: spaceMono.style.fontFamily, weights: [400, 700] },
  display: { label: 'Display (Bebas)', family: bebas.style.fontFamily, weights: [400] },
  hand: { label: 'Tulisan tangan', family: patrickHand.style.fontFamily, weights: [400] },
  marker: { label: 'Marker (Caveat)', family: caveat.style.fontFamily, weights: [500, 700] },
  script: { label: 'Script (Pacifico)', family: pacifico.style.fontFamily, weights: [400] },
  bubble: { label: 'Bubble Y2K (Bagel)', family: bagel.style.fontFamily, weights: [400] },
  typewriter: { label: 'Mesin ketik', family: specialElite.style.fontFamily, weights: [400] },
  scribble: { label: 'Coretan (Gochi)', family: gochi.style.fontFamily, weights: [400] },
  rounded: { label: 'Bulat (Nunito)', family: nunito.style.fontFamily, weights: [400, 600, 700, 800, 900] },
  impact: { label: 'WordArt Impact (Anton)', family: anton.style.fontFamily, weights: [400] },
  heavy: { label: 'WordArt Tebal (Archivo Black)', family: archivoBlack.style.fontFamily, weights: [400] },
  techno: { label: 'Tekno Y2K (Orbitron)', family: orbitron.style.fontFamily, weights: [500, 700, 900] },
  blackletter: { label: 'Gotik klasik (Unifraktur)', family: unifraktur.style.fontFamily, weights: [400] },
  gothic: { label: 'Gotik tegas (Grenze)', family: grenze.style.fontFamily, weights: [400, 600, 800] },
  pixelgothic: { label: 'Gotik piksel (Jacquard)', family: jacquard.style.fontFamily, weights: [400] },
  editorial: { label: 'Editorial (Instrument Serif)', family: instrument.style.fontFamily, weights: [400] },
};

export function nearestWeight(key: FontKey, weight: number): number {
  const ws = FONTS[key]?.weights ?? [400];
  return ws.reduce((best, w) => (Math.abs(w - weight) < Math.abs(best - weight) ? w : best), ws[0]);
}

export function canvasFont(key: FontKey, weight: number, size: number, italic = false): string {
  const f = FONTS[key] ?? FONTS.sans;
  return `${italic ? 'italic ' : ''}${nearestWeight(key, weight)} ${size}px ${f.family}`;
}

/** Ensures the fonts used by a set of text elements are loaded before drawing. */
export async function ensureFonts(specs: Array<{ font: FontKey; weight: number; italic?: boolean }>): Promise<void> {
  if (typeof document === 'undefined' || !document.fonts) return;
  const unique = new Set(specs.map((s) => canvasFont(s.font, s.weight, 32, s.italic)));
  await Promise.all(
    Array.from(unique).map((font) => document.fonts.load(font).catch(() => undefined)),
  );
}
