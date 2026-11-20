/**
 * Every web font used by the app AND by the frame renderer (canvas).
 * Self-hosted by next/font at build time — no runtime requests to Google.
 */
import {
  Bebas_Neue,
  Caveat,
  Pacifico,
  Patrick_Hand,
  Playfair_Display,
  Plus_Jakarta_Sans,
  Space_Mono,
} from 'next/font/google';

export const jakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  variable: '--font-jakarta',
  weight: ['400', '500', '600', '700', '800'],
  display: 'swap',
});
export const playfair = Playfair_Display({ subsets: ['latin'], weight: ['400', '700', '800'], style: ['normal', 'italic'], display: 'swap', preload: false });
export const spaceMono = Space_Mono({ subsets: ['latin'], variable: '--font-spacemono', weight: ['400', '700'], display: 'swap', preload: false });
export const bebas = Bebas_Neue({ subsets: ['latin'], weight: '400', display: 'swap', preload: false });
export const caveat = Caveat({ subsets: ['latin'], weight: ['500', '700'], display: 'swap', preload: false });
export const patrickHand = Patrick_Hand({ subsets: ['latin'], weight: '400', display: 'swap', preload: false });
export const pacifico = Pacifico({ subsets: ['latin'], weight: '400', display: 'swap', preload: false });

export const fontVariables = `${jakarta.variable} ${spaceMono.variable}`;
