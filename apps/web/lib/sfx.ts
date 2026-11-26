/**
 * Tiny synthesized UI sounds (WebAudio, no audio files): menu ticks, select,
 * countdown beeps, shutter, startup chime. Muted per device via localStorage.
 * Browsers only allow audio after a user gesture — the first tap unlocks it.
 */

const KEY = 'pv-sfx';
let ctx: AudioContext | null = null;

export function sfxEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return localStorage.getItem(KEY) !== 'off';
  } catch {
    return true;
  }
}

export function setSfxEnabled(on: boolean) {
  try {
    localStorage.setItem(KEY, on ? 'on' : 'off');
  } catch {
    /* private mode */
  }
}

function audio(): AudioContext | null {
  if (typeof window === 'undefined' || !sfxEnabled()) return null;
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  ctx ??= new AC();
  if (ctx.state === 'suspended') void ctx.resume().catch(() => {});
  return ctx;
}

function tone(freq: number, start: number, dur: number, o: { type?: OscillatorType; gain?: number; slide?: number } = {}) {
  const a = audio();
  if (!a) return;
  const t0 = a.currentTime + start;
  const osc = a.createOscillator();
  const g = a.createGain();
  osc.type = o.type ?? 'square';
  osc.frequency.setValueAtTime(freq, t0);
  if (o.slide) osc.frequency.exponentialRampToValueAtTime(Math.max(40, freq * o.slide), t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(o.gain ?? 0.06, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(a.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

function noise(start: number, dur: number, gain = 0.12) {
  const a = audio();
  if (!a) return;
  const len = Math.floor(a.sampleRate * dur);
  const buf = a.createBuffer(1, len, a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 2;
  const src = a.createBufferSource();
  src.buffer = buf;
  const g = a.createGain();
  g.gain.value = gain;
  src.connect(g).connect(a.destination);
  src.start(a.currentTime + start);
}

export const sfx = {
  /** Unlock audio inside a user gesture (call from a tap handler). */
  unlock() {
    audio();
  },
  tick: () => tone(1400, 0, 0.04, { gain: 0.035 }),
  select: () => {
    tone(880, 0, 0.07);
    tone(1320, 0.06, 0.1);
  },
  back: () => tone(520, 0, 0.09, { slide: 0.6 }),
  beep: (high = false) => tone(high ? 1760 : 990, 0, high ? 0.22 : 0.1, { type: 'sine', gain: 0.09 }),
  shutter: () => {
    noise(0, 0.06, 0.2);
    noise(0.07, 0.09, 0.12);
  },
  error: () => {
    tone(330, 0, 0.12, { type: 'sawtooth', gain: 0.05 });
    tone(220, 0.13, 0.22, { type: 'sawtooth', gain: 0.05 });
  },
  tada: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.09, 0.22, { type: 'triangle', gain: 0.07 })),
  /** Startup chime (an original little arpeggio). */
  chime: () => [392, 523, 659, 784, 988].forEach((f, i) => tone(f, i * 0.12, 0.6 - i * 0.05, { type: 'sine', gain: 0.06 })),
};
