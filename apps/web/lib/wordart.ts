/**
 * WordArt styles — client-safe definitions shared by the CSS component
 * (components/brand/WordArt.tsx) and the canvas renderer (stickers, zine).
 *
 * Inspired by the late-90s WordArt gallery (gradient fills, chunky 3D
 * extrusions, outlines, arcs and waves) but built from the Photovoks palette.
 */

export type WordArtStyleId = 'rainbow' | 'sunset' | 'sky' | 'chrome' | 'grape' | 'outline' | 'forest' | 'cobalt' | 'bubblegum' | 'arc';

export interface WordArtStyle {
  id: WordArtStyleId;
  label: string;
  /** CSS family var / canvas font key */
  font: 'impact' | 'heavy' | 'display' | 'serif';
  /** Gradient stops, top → bottom (or left → right when `horizontal`). */
  fill: string[];
  horizontal?: boolean;
  stroke?: { color: string; width: number };
  /** 3D extrusion: colour + depth (em fraction) + direction (dx, dy per step). */
  extrude?: { color: string; depth: number; dx: number; dy: number };
  /** Soft drop shadow under everything. */
  shadow?: string;
  /** Shape transform. */
  shape?: 'flat' | 'slant' | 'wave' | 'perspective' | 'arc' | 'bulge';
  italic?: boolean;
}

export const WORDART_STYLES: WordArtStyle[] = [
  { id: 'rainbow', label: 'Pelangi', font: 'heavy', fill: ['#FF3B6B', '#FF9F1C', '#FFE066', '#3DDC84', '#2F80ED', '#9B51E0'], horizontal: true, stroke: { color: '#FFFFFF', width: 0.025 }, shadow: 'rgba(26,20,16,0.35)', shape: 'flat' },
  { id: 'sunset', label: 'Emas 3D', font: 'impact', fill: ['#FFF3A3', '#FFC531', '#F28A12'], stroke: { color: '#7A3E06', width: 0.02 }, extrude: { color: '#8A3B0C', depth: 0.11, dx: 1, dy: 1 }, shape: 'perspective' },
  { id: 'sky', label: 'Langit', font: 'impact', fill: ['#E6F6FF', '#7CCBFF', '#2E8CE6'], stroke: { color: '#16457A', width: 0.03 }, extrude: { color: '#16457A', depth: 0.05, dx: 1, dy: 1 }, shape: 'wave' },
  { id: 'chrome', label: 'Krom', font: 'impact', fill: ['#FFFFFF', '#C9CED6', '#7D848F', '#E9ECF0', '#9AA1AB'], stroke: { color: '#2B2F36', width: 0.022 }, extrude: { color: '#2B2F36', depth: 0.08, dx: 1, dy: 1 }, shape: 'flat' },
  { id: 'grape', label: 'Anggur', font: 'heavy', fill: ['#5B8CFF', '#8E5BFF', '#C04BFF'], horizontal: true, stroke: { color: '#2A1060', width: 0.018 }, shadow: 'rgba(42,16,96,0.45)', shape: 'slant', italic: true },
  { id: 'outline', label: 'Outline', font: 'heavy', fill: ['#FFFFFF', '#FFFFFF'], stroke: { color: '#1A1410', width: 0.045 }, extrude: { color: '#FF9BD2', depth: 0.06, dx: 1, dy: 1 }, shape: 'flat' },
  { id: 'forest', label: 'Hutan 3D', font: 'impact', fill: ['#7BE07B', '#2E8B3E', '#1E5E2A'], stroke: { color: '#0E2B14', width: 0.02 }, extrude: { color: '#0E2B14', depth: 0.1, dx: -1, dy: 1 }, shape: 'slant' },
  { id: 'cobalt', label: 'Kobalt', font: 'heavy', fill: ['#7FA2FF', '#2747C9', '#1A2C8F'], stroke: { color: '#FFFFFF', width: 0.02 }, extrude: { color: '#C4201A', depth: 0.06, dx: 1, dy: 1 }, shape: 'flat' },
  { id: 'bubblegum', label: 'Permen', font: 'display', fill: ['#FFE1F1', '#FF9BD2', '#FF4FA8'], stroke: { color: '#7A0E45', width: 0.03 }, extrude: { color: '#7A0E45', depth: 0.05, dx: 0, dy: 1 }, shape: 'bulge' },
  { id: 'arc', label: 'Lengkung', font: 'heavy', fill: ['#FFD43B', '#C4201A'], stroke: { color: '#1A1410', width: 0.03 }, extrude: { color: '#1A1410', depth: 0.04, dx: 1, dy: 1 }, shape: 'arc' },
];

export const WORDART_BY_ID: Record<WordArtStyleId, WordArtStyle> = Object.fromEntries(WORDART_STYLES.map((s) => [s.id, s])) as Record<WordArtStyleId, WordArtStyle>;

export function isWordArtStyle(v: unknown): v is WordArtStyleId {
  return typeof v === 'string' && v in WORDART_BY_ID;
}

/** CSS linear-gradient for a style's fill. */
export function cssGradient(s: WordArtStyle): string {
  const stops = s.fill.map((c, i) => `${c} ${Math.round((i / Math.max(1, s.fill.length - 1)) * 100)}%`).join(', ');
  return `linear-gradient(${s.horizontal ? '90deg' : '180deg'}, ${stops})`;
}

/** text-shadow stack for the extrusion (in em, so it scales with font size). */
export function cssExtrusion(s: WordArtStyle): string {
  const parts: string[] = [];
  if (s.extrude) {
    const steps = Math.max(2, Math.round(s.extrude.depth * 100));
    for (let i = 1; i <= steps; i++) {
      const d = (i / 100).toFixed(3);
      parts.push(`${s.extrude.dx * Number(d)}em ${s.extrude.dy * Number(d)}em 0 ${s.extrude.color}`);
    }
  }
  if (s.shadow) parts.push(`0.04em 0.08em 0.12em ${s.shadow}`);
  else if (s.extrude) parts.push(`${(s.extrude.dx * s.extrude.depth + 0.02).toFixed(3)}em ${(s.extrude.dy * s.extrude.depth + 0.04).toFixed(3)}em 0.1em rgba(0,0,0,0.35)`);
  return parts.join(', ') || 'none';
}

// ── Canvas renderer (stickers, zine, frames) ────────────────────────────────

/**
 * Draws WordArt centred at (0, 0) of the current transform.
 * `family` is the real font-family string (next/font hashed name).
 * Returns the measured box so callers can hit-test / size selection handles.
 */
export function drawWordArt(ctx: CanvasRenderingContext2D, text: string, styleId: WordArtStyleId, size: number, family: string): { w: number; h: number } {
  const s = WORDART_BY_ID[styleId] ?? WORDART_STYLES[0];
  ctx.save();
  ctx.font = `${s.italic ? 'italic ' : ''}400 ${size}px ${family}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  const w = ctx.measureText(text).width;
  const h = size * 1.15;

  if (s.shape === 'slant') ctx.transform(1, -0.12, -0.18, 1, 0, 0);
  if (s.shape === 'perspective') ctx.transform(1, 0, -0.1, 0.92, 0, 0);

  const glyph = (paint: (ch: string, x: number, y: number, rot: number, scaleY: number) => void) => {
    if (s.shape === 'arc' || s.shape === 'wave' || s.shape === 'bulge') {
      let x = -w / 2;
      const r = w * 0.9;
      for (const ch of Array.from(text)) {
        const cw = ctx.measureText(ch).width;
        const cx = x + cw / 2;
        const t = w ? cx / (w / 2) : 0; // -1..1
        let y = 0;
        let rot = 0;
        let sy = 1;
        if (s.shape === 'arc') {
          // Letters on a circle: an arch (∩), ends lower than the middle.
          const a = cx / r;
          rot = a;
          y = r - Math.cos(a) * r;
        } else if (s.shape === 'wave') {
          y = Math.sin(t * Math.PI) * size * 0.14;
          rot = Math.cos(t * Math.PI) * 0.18;
        } else {
          sy = 1 + 0.28 * (1 - t * t);
        }
        paint(ch, cx, y, rot, sy);
        x += cw;
      }
    } else {
      paint(text, 0, 0, 0, 1);
    }
  };

  const draw = (mode: 'extrude' | 'fill' | 'stroke', fillStyle?: string | CanvasGradient, offX = 0, offY = 0) => {
    glyph((ch, x, y, rot, sy) => {
      ctx.save();
      ctx.translate(x + offX, y + offY);
      if (rot) ctx.rotate(rot);
      if (sy !== 1) ctx.scale(1, sy);
      if (mode === 'stroke') ctx.strokeText(ch, 0, 0);
      else {
        if (fillStyle) ctx.fillStyle = fillStyle;
        ctx.fillText(ch, 0, 0);
      }
      ctx.restore();
    });
  };

  if (s.shadow) {
    ctx.save();
    ctx.shadowColor = s.shadow;
    ctx.shadowBlur = size * 0.12;
    ctx.shadowOffsetY = size * 0.06;
    draw('fill', s.fill[0]);
    ctx.restore();
  }
  if (s.extrude) {
    const steps = Math.max(2, Math.round(s.extrude.depth * size));
    for (let i = steps; i >= 1; i--) draw('extrude', s.extrude.color, s.extrude.dx * i, s.extrude.dy * i);
  }
  if (s.stroke) {
    ctx.strokeStyle = s.stroke.color;
    ctx.lineWidth = s.stroke.width * size * 2;
    draw('stroke');
  }
  const g = s.horizontal ? ctx.createLinearGradient(-w / 2, 0, w / 2, 0) : ctx.createLinearGradient(0, -size / 2, 0, size / 2);
  s.fill.forEach((c, i) => g.addColorStop(i / Math.max(1, s.fill.length - 1), c));
  draw('fill', g);
  ctx.restore();
  return { w: w + (s.extrude ? s.extrude.depth * size : 0) + (s.stroke ? s.stroke.width * size * 2 : 0), h: h * (s.shape === 'arc' ? 1.5 : s.shape === 'bulge' ? 1.3 : 1) };
}
