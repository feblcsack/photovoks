'use client';

/**
 * SlotGeometryEditor
 *
 * Accepts an array of pixel-space slots ({ x, y, w, h } relative to 600×1800 canvas),
 * renders a live preview overlay on the frame thumbnail, and exposes the
 * converted fractional SlotGeometry[] for persistence.
 *
 * - Pixel inputs are updated live with no debounce (Requirement 11.8)
 * - On save, pixelToFraction() converts to fractional geometry with auto-computed aspectRatio
 * - Preview overlay uses a scaled-down version of the 600×1800 canvas
 *
 * Requirements: 11.7, 11.8
 */
import React, { useEffect, useRef } from 'react';
import type { SlotGeometry } from '@photovoks/shared-types';

// ── Pixel slot (input space, relative to 600×1800) ───────────────────────────
export interface PixelSlot {
  x: number;
  y: number;
  w: number;
  h: number;
}

// ── Conversion: pixel → fraction ─────────────────────────────────────────────
export function pixelToFraction(slot: PixelSlot): SlotGeometry {
  return {
    x: slot.x / 600,
    y: slot.y / 1800,
    w: slot.w / 600,
    h: slot.h / 1800,
    aspectRatio: slot.w / slot.h,
  };
}

// Slot overlay colours (semi-transparent)
const SLOT_COLORS = ['rgba(59,130,246,0.35)', 'rgba(16,185,129,0.35)', 'rgba(239,68,68,0.35)'];
const SLOT_BORDER_COLORS = ['#3b82f6', '#10b981', '#ef4444'];

// ── Component ────────────────────────────────────────────────────────────────

interface SlotGeometryEditorProps {
  /** Current pixel slots (controlled) */
  slots: PixelSlot[];
  /** Thumbnail image URL of the frame PNG */
  thumbnailUrl: string | null;
  /** Called on every keystroke with the updated pixel slots */
  onChange: (slots: PixelSlot[]) => void;
  /** Called when the user confirms the geometry (save button) */
  onSave: (fractionalSlots: SlotGeometry[]) => void;
  isSaving?: boolean;
}

export default function SlotGeometryEditor({
  slots,
  thumbnailUrl,
  onChange,
  onSave,
  isSaving = false,
}: SlotGeometryEditorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);

  // ── Preview canvas dimensions ─────────────────────────────────────────────
  // Display the 600×1800 canvas at 1/4 scale: 150×450 px
  const PREVIEW_W = 150;
  const PREVIEW_H = 450;
  const SCALE_X = PREVIEW_W / 600;
  const SCALE_Y = PREVIEW_H / 1800;

  // ── Draw preview whenever slots or thumbnail changes ─────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, PREVIEW_W, PREVIEW_H);

    // Draw frame thumbnail background
    if (imgRef.current && imgRef.current.complete && imgRef.current.naturalWidth > 0) {
      ctx.drawImage(imgRef.current, 0, 0, PREVIEW_W, PREVIEW_H);
    } else {
      // Placeholder background
      ctx.fillStyle = '#f3f4f6';
      ctx.fillRect(0, 0, PREVIEW_W, PREVIEW_H);
      ctx.fillStyle = '#9ca3af';
      ctx.font = '11px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('No frame image', PREVIEW_W / 2, PREVIEW_H / 2);
    }

    // Draw slot rectangles
    slots.forEach((slot, i) => {
      const px = slot.x * SCALE_X;
      const py = slot.y * SCALE_Y;
      const pw = slot.w * SCALE_X;
      const ph = slot.h * SCALE_Y;

      ctx.fillStyle = SLOT_COLORS[i % SLOT_COLORS.length];
      ctx.fillRect(px, py, pw, ph);

      ctx.strokeStyle = SLOT_BORDER_COLORS[i % SLOT_BORDER_COLORS.length];
      ctx.lineWidth = 1.5;
      ctx.strokeRect(px, py, pw, ph);

      // Slot number label
      ctx.fillStyle = SLOT_BORDER_COLORS[i % SLOT_BORDER_COLORS.length];
      ctx.font = 'bold 10px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(`${i + 1}`, px + 3, py + 11);
    });
  }, [slots, thumbnailUrl]);

  // ── Load frame image for canvas ───────────────────────────────────────────
  useEffect(() => {
    if (!thumbnailUrl) {
      imgRef.current = null;
      return;
    }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      imgRef.current = img;
      // Trigger redraw by forcing a no-op state update equivalent:
      // The slots dependency in the draw effect handles this on next render,
      // but we need to re-draw after image load. We use the canvas API directly.
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.clearRect(0, 0, PREVIEW_W, PREVIEW_H);
      ctx.drawImage(img, 0, 0, PREVIEW_W, PREVIEW_H);
      slots.forEach((slot, i) => {
        const px = slot.x * SCALE_X;
        const py = slot.y * SCALE_Y;
        const pw = slot.w * SCALE_X;
        const ph = slot.h * SCALE_Y;
        ctx.fillStyle = SLOT_COLORS[i % SLOT_COLORS.length];
        ctx.fillRect(px, py, pw, ph);
        ctx.strokeStyle = SLOT_BORDER_COLORS[i % SLOT_BORDER_COLORS.length];
        ctx.lineWidth = 1.5;
        ctx.strokeRect(px, py, pw, ph);
        ctx.fillStyle = SLOT_BORDER_COLORS[i % SLOT_BORDER_COLORS.length];
        ctx.font = 'bold 10px sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(`${i + 1}`, px + 3, py + 11);
      });
    };
    img.src = thumbnailUrl;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [thumbnailUrl]);

  // ── Slot field change handler ─────────────────────────────────────────────
  function handleSlotChange(index: number, field: keyof PixelSlot, raw: string) {
    const value = parseInt(raw, 10);
    const numValue = isNaN(value) ? 0 : value;
    const updated = slots.map((s, i) =>
      i === index ? { ...s, [field]: numValue } : s
    );
    onChange(updated);
  }

  function addSlot() {
    onChange([...slots, { x: 0, y: 0, w: 200, h: 200 }]);
  }

  function removeSlot(index: number) {
    onChange(slots.filter((_, i) => i !== index));
  }

  function handleSave() {
    const fractional = slots.map(pixelToFraction);
    onSave(fractional);
  }

  return (
    <div className="flex gap-6 items-start">
      {/* Preview canvas */}
      <div className="flex-shrink-0">
        <p className="text-xs font-medium text-gray-500 mb-1">Preview</p>
        <canvas
          ref={canvasRef}
          width={PREVIEW_W}
          height={PREVIEW_H}
          className="border border-gray-200 rounded"
          aria-label="Frame slot geometry preview"
        />
        <p className="text-xs text-gray-400 mt-1">Scale: 1/4 (150×450)</p>
      </div>

      {/* Slot inputs */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-medium text-gray-700">
            Photo Slots
            <span className="ml-1 text-xs font-normal text-gray-400">
              (pixel coords relative to 600×1800)
            </span>
          </p>
          <button
            type="button"
            onClick={addSlot}
            className="text-xs rounded px-2 py-1 bg-gray-100 text-gray-700 hover:bg-gray-200"
          >
            + Add Slot
          </button>
        </div>

        {slots.length === 0 && (
          <p className="text-sm text-gray-400 py-4">No slots defined. Add at least one slot.</p>
        )}

        <div className="space-y-3">
          {slots.map((slot, i) => (
            <div key={i} className="bg-gray-50 rounded-md p-3 border border-gray-200">
              <div className="flex items-center justify-between mb-2">
                <span
                  className="text-xs font-medium"
                  style={{ color: SLOT_BORDER_COLORS[i % SLOT_BORDER_COLORS.length] }}
                >
                  Slot {i + 1}
                </span>
                <button
                  type="button"
                  onClick={() => removeSlot(i)}
                  className="text-xs text-red-500 hover:text-red-700"
                  aria-label={`Remove slot ${i + 1}`}
                >
                  Remove
                </button>
              </div>
              <div className="grid grid-cols-4 gap-2">
                {(['x', 'y', 'w', 'h'] as const).map((field) => (
                  <div key={field}>
                    <label
                      htmlFor={`slot-${i}-${field}`}
                      className="block text-xs text-gray-500 mb-0.5 uppercase"
                    >
                      {field}
                    </label>
                    <input
                      id={`slot-${i}-${field}`}
                      type="number"
                      min={0}
                      max={field === 'x' || field === 'w' ? 600 : 1800}
                      value={slot[field]}
                      onChange={(e) => handleSlotChange(i, field, e.target.value)}
                      className="block w-full rounded border border-gray-300 px-2 py-1 text-sm text-gray-900 focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500"
                    />
                  </div>
                ))}
              </div>
              {/* Computed aspect ratio hint */}
              {slot.w > 0 && slot.h > 0 && (
                <p className="mt-1.5 text-xs text-gray-400">
                  Aspect ratio: {(slot.w / slot.h).toFixed(3)} — Fraction: x={(slot.x/600).toFixed(4)}, y={
                    (slot.y/1800).toFixed(4)}, w={
                    (slot.w/600).toFixed(4)}, h={(slot.h/1800).toFixed(4)}
                </p>
              )}
            </div>
          ))}
        </div>

        {slots.length > 0 && (
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className="mt-4 rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-900"
          >
            {isSaving ? 'Saving…' : 'Save Slot Geometry'}
          </button>
        )}
      </div>
    </div>
  );
}
