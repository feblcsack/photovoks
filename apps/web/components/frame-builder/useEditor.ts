'use client';

import { useCallback, useRef, useState } from 'react';
import type { FrameDesign, FrameElement, PhotoElement } from '@/lib/frames/types';
import { newId } from '@/lib/frames/types';

const MAX_HISTORY = 80;

/**
 * Editor state with undo/redo. Rapid edits to the same field (typing,
 * slider drags) are coalesced into one history step.
 */
export function useEditor(initial: FrameDesign) {
  const [design, setDesignState] = useState<FrameDesign>(initial);
  const designRef = useRef<FrameDesign>(initial);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const past = useRef<FrameDesign[]>([]);
  const future = useRef<FrameDesign[]>([]);
  const lastKey = useRef<{ key: string; at: number } | null>(null);
  const dragOrigin = useRef<FrameDesign | null>(null);
  const [savedVersion, setSavedVersion] = useState(() => JSON.stringify(initial));

  const [hist, setHist] = useState({ undo: 0, redo: 0 });
  const set = useCallback((d: FrameDesign) => {
    designRef.current = d;
    setDesignState(d);
    setHist({ undo: past.current.length, redo: future.current.length });
  }, []);

  const commit = useCallback(
    (next: FrameDesign | ((d: FrameDesign) => FrameDesign), coalesceKey?: string) => {
      const prev = designRef.current;
      const value = typeof next === 'function' ? next(prev) : next;
      if (value === prev) return;
      const now = Date.now();
      const coalesce = coalesceKey && lastKey.current && lastKey.current.key === coalesceKey && now - lastKey.current.at < 800;
      if (!coalesce) {
        past.current.push(prev);
        if (past.current.length > MAX_HISTORY) past.current.shift();
      }
      lastKey.current = coalesceKey ? { key: coalesceKey, at: now } : null;
      future.current = [];
      set(value);
    },
    [set],
  );

  /** Live update without a history step (during drag). */
  const preview = useCallback((next: FrameDesign) => set(next), [set]);
  const beginDrag = useCallback(() => {
    dragOrigin.current = designRef.current;
  }, []);
  const endDrag = useCallback(() => {
    if (dragOrigin.current && dragOrigin.current !== designRef.current) {
      past.current.push(dragOrigin.current);
      future.current = [];
      lastKey.current = null;
      setHist({ undo: past.current.length, redo: future.current.length });
    }
    dragOrigin.current = null;
  }, []);

  const undo = useCallback(() => {
    const prev = past.current.pop();
    if (!prev) return;
    future.current.push(designRef.current);
    lastKey.current = null;
    set(prev);
  }, [set]);

  const redo = useCallback(() => {
    const next = future.current.pop();
    if (!next) return;
    past.current.push(designRef.current);
    lastKey.current = null;
    set(next);
  }, [set]);

  const updateElement = useCallback(
    (id: string, patch: Partial<FrameElement>, coalesceKey?: string | null) =>
      commit(
        (d) => ({ ...d, elements: d.elements.map((e) => (e.id === id ? ({ ...e, ...patch } as FrameElement) : e)) }),
        coalesceKey === null ? undefined : coalesceKey ?? `${id}:${Object.keys(patch).join(',')}`,
      ),
    [commit],
  );

  const addElement = useCallback(
    (el: FrameElement) => {
      commit((d) => ({ ...d, elements: [...d.elements, el] }));
      setSelectedId(el.id);
    },
    [commit],
  );

  const removeElement = useCallback(
    (id: string) => {
      commit((d) => ({ ...d, elements: d.elements.filter((e) => e.id !== id) }));
      setSelectedId(null);
    },
    [commit],
  );

  const duplicateElement = useCallback(
    (id: string) => {
      const d = designRef.current;
      const el = d.elements.find((e) => e.id === id);
      if (!el) return;
      const copy = { ...el, id: newId(), x: el.x + 24, y: el.y + 24 } as FrameElement;
      if (copy.type === 'photo') (copy as PhotoElement).slot = nextSlotIndex(d);
      const elements = [...d.elements];
      elements.splice(d.elements.indexOf(el) + 1, 0, copy);
      commit({ ...d, elements });
      setSelectedId(copy.id);
    },
    [commit],
  );

  const reorder = useCallback(
    (id: string, to: 'up' | 'down' | 'top' | 'bottom') =>
      commit((d) => {
        const i = d.elements.findIndex((e) => e.id === id);
        if (i < 0) return d;
        const elements = [...d.elements];
        const [el] = elements.splice(i, 1);
        const j = to === 'top' ? elements.length : to === 'bottom' ? 0 : to === 'up' ? Math.min(elements.length, i + 1) : Math.max(0, i - 1);
        elements.splice(j, 0, el);
        return { ...d, elements };
      }),
    [commit],
  );

  const markSaved = useCallback((d: FrameDesign) => setSavedVersion(JSON.stringify(d)), []);

  return {
    design,
    designRef,
    selectedId,
    setSelectedId,
    selected: design.elements.find((e) => e.id === selectedId) ?? null,
    commit,
    preview,
    beginDrag,
    endDrag,
    undo,
    redo,
    canUndo: hist.undo > 0,
    canRedo: hist.redo > 0,
    updateElement,
    addElement,
    removeElement,
    duplicateElement,
    reorder,
    dirty: JSON.stringify(design) !== savedVersion,
    markSaved,
  };
}

export type Editor = ReturnType<typeof useEditor>;

export function nextSlotIndex(d: FrameDesign): number {
  const used = new Set(d.elements.filter((e): e is PhotoElement => e.type === 'photo').map((e) => e.slot));
  let i = 0;
  while (used.has(i)) i++;
  return i;
}

/** Re-lays out photo slots in a grid (keeps other elements). */
/**
 * `repeat`: every column repeats the same photos (twin strips on one sheet —
 * e.g. 4R with 3 photos on the left and the same 3 on the right). `count`
 * is then the number of photos per column and the guest only takes `count`.
 */
export function autoLayoutSlots(d: FrameDesign, opts: { count: number; cols: number; padding: number; gap: number; footer: number; radius: number; repeat?: boolean }): FrameDesign {
  const others = d.elements.filter((e) => e.type !== 'photo');
  const existing = d.elements.filter((e): e is PhotoElement => e.type === 'photo').sort((a, b) => a.slot - b.slot);
  const repeat = !!opts.repeat && opts.cols > 1;
  const total = repeat ? opts.count * opts.cols : opts.count;
  const rows = repeat ? opts.count : Math.ceil(opts.count / opts.cols);
  const innerW = d.width - opts.padding * 2;
  const innerH = d.height - opts.padding * 2 - opts.footer;
  const w = (innerW - opts.gap * (opts.cols - 1)) / opts.cols;
  const h = (innerH - opts.gap * (rows - 1)) / rows;
  const slots: PhotoElement[] = Array.from({ length: total }, (_, i) => {
    const r = Math.floor(i / opts.cols);
    const c = i % opts.cols;
    const base = existing[i];
    return {
      id: base?.id ?? newId(),
      type: 'photo',
      slot: repeat ? r : i,
      x: Math.round(opts.padding + c * (w + opts.gap)),
      y: Math.round(opts.padding + r * (h + opts.gap)),
      w: Math.round(w),
      h: Math.round(h),
      radius: opts.radius,
      borderWidth: base?.borderWidth ?? 0,
      borderColor: base?.borderColor ?? '#000000',
    };
  });
  // Slots below decorations that sit behind them (e.g. background shapes).
  return { ...d, elements: [...slots, ...others] };
}

/** Scales every element when the canvas size changes. */
export function resizeCanvas(d: FrameDesign, width: number, height: number): FrameDesign {
  const sx = width / d.width;
  const sy = height / d.height;
  const s = Math.min(sx, sy);
  return {
    ...d,
    width,
    height,
    elements: d.elements.map((e) => {
      const base = { ...e, x: Math.round(e.x * sx), y: Math.round(e.y * sy), w: Math.round(e.w * sx), h: Math.round(e.h * sy) };
      if (base.type === 'text') return { ...base, size: Math.round(base.size * s) };
      if (base.type === 'photo') return { ...base, radius: Math.round(base.radius * s), borderWidth: Math.round(base.borderWidth * s) };
      return base;
    }) as FrameElement[],
  };
}

/** Synthetic "people" photos for previews — no external assets needed. */
export function samplePhotos(count: number, aspect = 3 / 4): HTMLCanvasElement[] {
  if (typeof document === 'undefined') return []; // SSR: placeholders until hydrated
  const palettes = [
    ['#F6D5C3', '#E9A27A', '#5A3A2E'],
    ['#CFE3F7', '#88B0DC', '#2F3E57'],
    ['#E6F2D9', '#A9CF8A', '#3B4A2B'],
    ['#F7E2EF', '#D99AC0', '#5B2F4A'],
    ['#FFF1C9', '#F2C35B', '#5C4520'],
    ['#E0DBF7', '#A399E6', '#33295E'],
  ];
  return Array.from({ length: count }, (_, i) => {
    const w = 600;
    const h = Math.round(w / aspect);
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d')!;
    const [bg, mid, dark] = palettes[i % palettes.length];
    const g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, bg);
    g.addColorStop(1, mid);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    const people = 1 + (i % 2);
    for (let p = 0; p < people; p++) {
      const cx = people === 1 ? w / 2 : w * (0.32 + p * 0.36);
      const s = people === 1 ? 1 : 0.8;
      ctx.fillStyle = dark;
      ctx.globalAlpha = 0.85;
      ctx.beginPath();
      ctx.ellipse(cx, h * 0.98, w * 0.3 * s, h * 0.36 * s, 0, Math.PI, 0);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(cx, h * 0.48, w * 0.13 * s, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    return c;
  });
}
