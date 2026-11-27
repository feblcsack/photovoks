/**
 * Every web font used by the app AND by the frame renderer (canvas).
 * Self-hosted by next/font at build time — no runtime requests to Google.
 */
import {
  Anton,
  Archivo_Black,
  Bagel_Fat_One,
  Nunito,
  Orbitron,
  Gochi_Hand,
  Special_Elite,
  Bebas_Neue,
  Caveat,
  Pacifico,
  Pixelify_Sans,
  Patrick_Hand,
  Playfair_Display,
  Plus_Jakarta_Sans,
  Space_Mono,
} from 'next/font/google';

/**
 * Type system (v5):
 *  - Nunito        body + UI. Rounded terminals echo the bubbly logo and the
 *                  friendly Xbox-360 / PS2 dashboard labels; very legible on iPad.
 *  - Bagel Fat One display (headings) — Y2K bubble, matches the logo.
 *  - Anton         WordArt "Impact" face (the classic WordArt / meme poster).
 *  - Archivo Black WordArt "Arial Black" face (arcs, waves, 3D extrusions).
 *  - Orbitron      techno accent: prices, codes, counters (PS2 / Y2K chrome).
 *  - Pixelify Sans the retro OS chrome only ("Photovoks 98").
 *  - Special Elite + Gochi Hand: receipts / scribbles (scrapbook details).
 * Plus Jakarta Sans stays for the canvas 'sans' key so existing frames render
 * exactly as before.
 */
export const nunito = Nunito({
  subsets: ['latin'],
  variable: '--font-nunito',
  weight: ['400', '600', '700', '800', '900'],
  display: 'swap',
});
export const jakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  variable: '--font-jakarta',
  weight: ['400', '500', '600', '700', '800'],
  display: 'swap',
  preload: false,
});
export const anton = Anton({ subsets: ['latin'], variable: '--font-anton', weight: '400', display: 'swap', preload: false });
export const archivoBlack = Archivo_Black({ subsets: ['latin'], variable: '--font-archivo-black', weight: '400', display: 'swap', preload: false });
export const orbitron = Orbitron({ subsets: ['latin'], variable: '--font-orbitron', weight: ['500', '700', '900'], display: 'swap', preload: false });
export const playfair = Playfair_Display({ subsets: ['latin'], weight: ['400', '700', '800'], style: ['normal', 'italic'], display: 'swap', preload: false });
export const spaceMono = Space_Mono({ subsets: ['latin'], variable: '--font-spacemono', weight: ['400', '700'], display: 'swap', preload: false });
export const bebas = Bebas_Neue({ subsets: ['latin'], weight: '400', display: 'swap', preload: false });
export const caveat = Caveat({ subsets: ['latin'], weight: ['500', '700'], display: 'swap', preload: false });
export const patrickHand = Patrick_Hand({ subsets: ['latin'], weight: '400', display: 'swap', preload: false });
export const pacifico = Pacifico({ subsets: ['latin'], weight: '400', display: 'swap', preload: false });

/** Y2K display face — bubbly, like the Photovoks logo. */
export const bagel = Bagel_Fat_One({ subsets: ['latin'], variable: '--font-bagel', weight: '400', display: 'swap' });
/** Typewriter — passport fields, receipts, zine captions. */
export const specialElite = Special_Elite({ subsets: ['latin'], variable: '--font-typewriter', weight: '400', display: 'swap' });
/** Scribbles / handwritten notes. */
export const gochi = Gochi_Hand({ subsets: ['latin'], variable: '--font-scribble', weight: '400', display: 'swap', preload: false });

/** Retro OS (Windows-98-ish) title bars, taskbar, dialogs. */
export const pixelify = Pixelify_Sans({ subsets: ['latin'], variable: '--font-pixelify', weight: ['400', '600', '700'], display: 'swap' });

export const fontVariables = `${nunito.variable} ${jakarta.variable} ${spaceMono.variable} ${bagel.variable} ${specialElite.variable} ${gochi.variable} ${pixelify.variable} ${anton.variable} ${archivoBlack.variable} ${orbitron.variable}`;
