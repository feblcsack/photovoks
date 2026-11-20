/**
 * AI style presets (client-safe). Prompts are sent server-side only — the
 * browser just picks a style id. Add a style here and it becomes selectable
 * in event settings.
 */
export interface AiStyle {
  id: string;
  label: string;
  description: string;
  /** Two-tone swatch for the style picker. */
  swatch: [string, string];
  prompt: string;
}

const KEEP_IDENTITY =
  " Keep every person's identity, face shape, pose, expression, hairstyle and clothing recognisable. " +
  'Keep the same composition and framing. Do not add any text, logo or watermark.';

export const AI_STYLES: AiStyle[] = [
  {
    id: 'doodle',
    label: 'Doodle',
    description: 'Ilustrasi garis tinta + coretan lucu',
    swatch: ['#FFF7E0', '#1A1A1A'],
    prompt:
      'Redraw this photo as a playful hand-drawn doodle illustration: bold black ink outlines, simple cute shapes, ' +
      'light pastel accents, white paper background, small doodle decorations (hearts, stars, sparkles) around the people.' +
      KEEP_IDENTITY,
  },
  {
    id: 'sketch',
    label: 'Sketsa Pensil',
    description: 'Graphite di atas kertas sketsa',
    swatch: ['#F2F0EB', '#55524C'],
    prompt:
      'Transform this photo into a detailed graphite pencil sketch on textured sketchbook paper, expressive linework, ' +
      'soft cross-hatching for shading, only graphite tones, no colour.' + KEEP_IDENTITY,
  },
  {
    id: 'anime',
    label: 'Anime',
    description: 'Ilustrasi anime cerah',
    swatch: ['#FFD6E8', '#4F7CFF'],
    prompt:
      'Redraw this photo as a high quality anime illustration with clean cel shading, vibrant colours, ' +
      'soft glowing light and a dreamy background.' + KEEP_IDENTITY,
  },
  {
    id: 'watercolor',
    label: 'Cat Air',
    description: 'Lukisan cat air lembut',
    swatch: ['#D8ECF7', '#E79AB0'],
    prompt:
      'Repaint this photo as a delicate watercolor painting with soft bleeding edges, light paper texture, ' +
      'gentle pastel washes and loose brush strokes.' + KEEP_IDENTITY,
  },
  {
    id: 'popart',
    label: 'Pop Art',
    description: 'Warna berani + halftone',
    swatch: ['#FFE14D', '#E8322F'],
    prompt:
      'Turn this photo into bold 1960s pop art: flat saturated colours, thick black outlines, halftone dot shading ' +
      'and a bright solid background.' + KEEP_IDENTITY,
  },
  {
    id: 'claymation',
    label: 'Clay 3D',
    description: 'Figur clay / plastisin',
    swatch: ['#FFCFA8', '#7C5CFF'],
    prompt:
      'Recreate this photo as a charming 3D claymation scene: people as handmade plasticine figures with visible ' +
      'fingerprint texture, soft studio lighting and a simple colourful set.' + KEEP_IDENTITY,
  },
  {
    id: 'comic',
    label: 'Komik',
    description: 'Panel komik berwarna',
    swatch: ['#BFE3FF', '#202020'],
    prompt:
      'Redraw this photo as a dynamic western comic book panel with confident inked lines, cel colours, ' +
      'dramatic shading and subtle speed lines in the background.' + KEEP_IDENTITY,
  },
  {
    id: 'vintage',
    label: 'Film Vintage',
    description: 'Foto film 70-an',
    swatch: ['#E8D3A8', '#8A4B2A'],
    prompt:
      'Make this photo look like a 1970s analog film photograph: warm faded colours, soft grain, gentle light leaks ' +
      'and slightly lifted blacks. Keep it photographic.' + KEEP_IDENTITY,
  },
];

export const CUSTOM_STYLE_ID = 'custom';

export function styleById(id: string): AiStyle | undefined {
  return AI_STYLES.find((s) => s.id === id);
}
