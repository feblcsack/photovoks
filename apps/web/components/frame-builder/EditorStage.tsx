'use client';

import React, { useEffect, useRef, useState } from 'react';
import { renderDesign, type Drawable } from '@/lib/frames/render';
import type { FrameElement } from '@/lib/frames/types';
import { cn } from '@/lib/utils';
import type { Editor } from './useEditor';

type Handle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';
const HANDLES: Handle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
const HANDLE_POS: Record<Handle, string> = {
  nw: 'left-0 top-0 cursor-nwse-resize',
  n: 'left-1/2 top-0 cursor-ns-resize',
  ne: 'left-full top-0 cursor-nesw-resize',
  e: 'left-full top-1/2 cursor-ew-resize',
  se: 'left-full top-full cursor-nwse-resize',
  s: 'left-1/2 top-full cursor-ns-resize',
  sw: 'left-0 top-full cursor-nesw-resize',
  w: 'left-0 top-1/2 cursor-ew-resize',
};

interface Rect { x: number; y: number; w: number; h: number }
interface DragState {
  mode: 'move' | 'resize';
  id: string;
  handle?: Handle;
  startX: number;
  startY: number;
  orig: Rect;
  aspect: number;
}

const SNAP_PX = 6;

function snapAxis(values: number[], targets: number[], threshold: number): { delta: number; guide: number | null } {
  let best = { delta: 0, guide: null as number | null, dist: threshold + 1 };
  for (const v of values) {
    for (const t of targets) {
      const d = Math.abs(v - t);
      if (d < best.dist) best = { delta: t - v, guide: t, dist: d };
    }
  }
  return best.dist <= threshold ? { delta: best.delta, guide: best.guide } : { delta: 0, guide: null };
}

export function EditorStage({ editor, zoom, photos, assets, tokens, showGuides = true }: { editor: Editor; zoom: number; photos: (Drawable | null)[] | undefined; assets: Map<string, Drawable>; tokens: Record<string, string>; showGuides?: boolean }) {
  const { design, selectedId, setSelectedId } = editor;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drag = useRef<DragState | null>(null);
  const [guides, setGuides] = useState<{ x: number | null; y: number | null }>({ x: null, y: null });
  const [hoverId, setHoverId] = useState<string | null>(null);

  // Render
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const dpr = Math.min(2, typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1);
    const scale = Math.min(zoom * dpr, 2400 / design.width, 1.5);
    c.width = Math.round(design.width * scale);
    c.height = Math.round(design.height * scale);
    const raf = requestAnimationFrame(() => {
      const ctx = c.getContext('2d');
      if (ctx) renderDesign(ctx, design, { photos, assets, placeholders: true, tokens, scale });
    });
    return () => cancelAnimationFrame(raf);
  }, [design, zoom, photos, assets, tokens]);

  function onPointerDown(e: React.PointerEvent, el: FrameElement, handle?: Handle) {
    e.stopPropagation();
    setSelectedId(el.id);
    if (el.locked) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { mode: handle ? 'resize' : 'move', id: el.id, handle, startX: e.clientX, startY: e.clientY, orig: { x: el.x, y: el.y, w: el.w, h: el.h }, aspect: el.w / el.h };
    editor.beginDrag();
  }

  function onPointerMove(e: React.PointerEvent) {
    const st = drag.current;
    if (!st) return;
    const dx = (e.clientX - st.startX) / zoom;
    const dy = (e.clientY - st.startY) / zoom;
    const d = editor.designRef.current;
    const threshold = SNAP_PX / zoom;
    const others = d.elements.filter((x) => x.id !== st.id && !x.hidden);
    const xTargets = [0, d.width / 2, d.width, ...others.flatMap((o) => [o.x, o.x + o.w / 2, o.x + o.w])];
    const yTargets = [0, d.height / 2, d.height, ...others.flatMap((o) => [o.y, o.y + o.h / 2, o.y + o.h])];
    let r: Rect = { ...st.orig };
    let gx: number | null = null;
    let gy: number | null = null;

    if (st.mode === 'move') {
      r.x = st.orig.x + dx;
      r.y = st.orig.y + dy;
      if (!e.altKey) {
        const sx = snapAxis([r.x, r.x + r.w / 2, r.x + r.w], xTargets, threshold);
        const sy = snapAxis([r.y, r.y + r.h / 2, r.y + r.h], yTargets, threshold);
        r.x += sx.delta;
        r.y += sy.delta;
        gx = sx.guide;
        gy = sy.guide;
      }
    } else if (st.handle) {
      const h = st.handle;
      let { x, y, w, h: hh } = st.orig;
      if (h.includes('e')) w = st.orig.w + dx;
      if (h.includes('s')) hh = st.orig.h + dy;
      if (h.includes('w')) {
        w = st.orig.w - dx;
        x = st.orig.x + dx;
      }
      if (h.includes('n')) {
        hh = st.orig.h - dy;
        y = st.orig.y + dy;
      }
      // Keep ratio on corners with Shift (or always for images).
      const el = d.elements.find((x2) => x2.id === st.id);
      if (h.length === 2 && (e.shiftKey || el?.type === 'image')) {
        if (Math.abs(dx) > Math.abs(dy)) {
          const nh = w / st.aspect;
          if (h.includes('n')) y = st.orig.y + st.orig.h - nh;
          hh = nh;
        } else {
          const nw = hh * st.aspect;
          if (h.includes('w')) x = st.orig.x + st.orig.w - nw;
          w = nw;
        }
      }
      if (!e.altKey) {
        if (h.includes('e')) {
          const s = snapAxis([x + w], xTargets, threshold);
          w += s.delta;
          gx = s.guide;
        }
        if (h.includes('w')) {
          const s = snapAxis([x], xTargets, threshold);
          x += s.delta;
          w -= s.delta;
          gx = s.guide;
        }
        if (h.includes('s')) {
          const s = snapAxis([y + hh], yTargets, threshold);
          hh += s.delta;
          gy = s.guide;
        }
        if (h.includes('n')) {
          const s = snapAxis([y], yTargets, threshold);
          y += s.delta;
          hh -= s.delta;
          gy = s.guide;
        }
      }
      r = { x, y, w: Math.max(8, w), h: Math.max(8, hh) };
    }

    r = { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.w), h: Math.round(r.h) };
    editor.preview({ ...d, elements: d.elements.map((x2) => (x2.id === st.id ? ({ ...x2, ...r } as FrameElement) : x2)) });
    setGuides({ x: gx, y: gy });
  }

  function onPointerUp() {
    if (!drag.current) return;
    drag.current = null;
    editor.endDrag();
    setGuides({ x: null, y: null });
  }

  const W = design.width * zoom;
  const H = design.height * zoom;

  return (
    <div className="relative select-none" style={{ width: W, height: H }} onPointerDown={() => setSelectedId(null)}>
      <canvas ref={canvasRef} className="absolute inset-0 size-full shadow-[0_20px_50px_-20px_rgba(14,20,36,0.45),0_0_0_1px_rgba(14,20,36,0.06)]" />
      <div className="absolute inset-0 touch-none" onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
        {design.elements.map((el) => {
          if (el.hidden) return null;
          const sel = el.id === selectedId;
          return (
            <div
              key={el.id}
              onPointerDown={(e) => onPointerDown(e, el)}
              onPointerEnter={() => setHoverId(el.id)}
              onPointerLeave={() => setHoverId((h) => (h === el.id ? null : h))}
              className={cn('absolute', el.locked ? 'cursor-default' : 'cursor-move', sel ? 'outline-2 outline-brand' : hoverId === el.id ? 'outline-1 outline-brand/60 outline-dashed' : '')}
              style={{ left: el.x * zoom, top: el.y * zoom, width: el.w * zoom, height: el.h * zoom }}
            >
              {sel && el.type === 'photo' ? <span className="absolute -top-6 left-0 rounded-[5px] bg-brand px-1.5 py-0.5 text-[10px] font-bold whitespace-nowrap text-white">Foto {el.slot + 1}</span> : null}
              {sel && !el.locked
                ? HANDLES.map((h) => (
                    <span
                      key={h}
                      onPointerDown={(e) => onPointerDown(e, el, h)}
                      className={cn('absolute z-10 flex size-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center', HANDLE_POS[h])}
                    >
                      <span className="size-2.5 rounded-[3px] border-[1.5px] border-brand bg-white shadow" />
                    </span>
                  ))
                : null}
            </div>
          );
        })}
        {showGuides && guides.x !== null ? <div className="pointer-events-none absolute top-0 bottom-0 w-px bg-[#FF3D7F]" style={{ left: guides.x * zoom }} /> : null}
        {showGuides && guides.y !== null ? <div className="pointer-events-none absolute right-0 left-0 h-px bg-[#FF3D7F]" style={{ top: guides.y * zoom }} /> : null}
      </div>
    </div>
  );
}
