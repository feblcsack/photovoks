'use client';

/**
 * FrameEditForm
 *
 * Client component for editing a frame: name, active toggle, and slot geometry.
 * Requirements: 11.6, 11.7, 11.8
 */
import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import SlotGeometryEditor, {
  type PixelSlot,
  pixelToFraction,
} from '@/components/admin/SlotGeometryEditor';
import type { SlotGeometry } from '@photovoks/shared-types';

// Convert fractional SlotGeometry to pixel PixelSlot for editor initialisation
function fractionToPixel(geo: SlotGeometry): PixelSlot {
  return {
    x: Math.round(geo.x * 600),
    y: Math.round(geo.y * 1800),
    w: Math.round(geo.w * 600),
    h: Math.round(geo.h * 1800),
  };
}

interface FrameEditFormProps {
  frameId: string;
  eventId: string;
  initialName: string;
  initialIsActive: boolean;
  initialSlotGeometry: SlotGeometry[];
  thumbnailUrl: string | null;
}

export default function FrameEditForm({
  frameId,
  eventId,
  initialName,
  initialIsActive,
  initialSlotGeometry,
  thumbnailUrl,
}: FrameEditFormProps) {
  const router = useRouter();

  const [name, setName] = useState(initialName);
  const [isActive, setIsActive] = useState(initialIsActive);
  const [slots, setSlots] = useState<PixelSlot[]>(
    initialSlotGeometry.map(fractionToPixel)
  );

  const [isSavingDetails, setIsSavingDetails] = useState(false);
  const [isSavingSlots, setIsSavingSlots] = useState(false);
  const [detailsError, setDetailsError] = useState<string | null>(null);
  const [detailsSuccess, setDetailsSuccess] = useState(false);
  const [slotsError, setSlotsError] = useState<string | null>(null);
  const [slotsSuccess, setSlotsSuccess] = useState(false);

  async function handleSaveDetails(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setDetailsError('Frame name is required.');
      return;
    }

    setIsSavingDetails(true);
    setDetailsError(null);
    setDetailsSuccess(false);

    try {
      const res = await fetch(`/api/admin/frames/${frameId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), isActive }),
      });

      if (!res.ok) {
        const data = await res.json() as { error?: string };
        throw new Error(data.error ?? 'Failed to save');
      }

      setDetailsSuccess(true);
      setTimeout(() => setDetailsSuccess(false), 2000);
      router.refresh();
    } catch (err) {
      setDetailsError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setIsSavingDetails(false);
    }
  }

  async function handleSaveSlots(fractionalSlots: SlotGeometry[]) {
    setIsSavingSlots(true);
    setSlotsError(null);
    setSlotsSuccess(false);

    try {
      const res = await fetch(`/api/admin/frames/${frameId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slotGeometry: fractionalSlots }),
      });

      if (!res.ok) {
        const data = await res.json() as { error?: string };
        throw new Error(data.error ?? 'Failed to save slot geometry');
      }

      setSlotsSuccess(true);
      setTimeout(() => setSlotsSuccess(false), 2000);
      router.refresh();
    } catch (err) {
      setSlotsError(err instanceof Error ? err.message : 'Failed to save slots');
    } finally {
      setIsSavingSlots(false);
    }
  }

  return (
    <div className="space-y-8">
      {/* ── Frame Details ─────────────────────────────────────────────── */}
      <div className="bg-white rounded-lg border border-gray-200 p-5">
        <h2 className="text-sm font-semibold text-gray-900 mb-4">Frame Details</h2>
        <form onSubmit={(e) => void handleSaveDetails(e)} className="space-y-4 max-w-md">
          <div>
            <label htmlFor="frame-name" className="block text-xs font-medium text-gray-700 mb-1">
              Name
            </label>
            <input
              id="frame-name"
              type="text"
              value={name}
              onChange={(e) => { setName(e.target.value); setDetailsError(null); }}
              className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500"
            />
          </div>

          {/* Active toggle */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              role="switch"
              aria-checked={isActive}
              onClick={() => setIsActive((v) => !v)}
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 ${
                isActive ? 'bg-green-600' : 'bg-gray-300'
              }`}
            >
              <span
                className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
                  isActive ? 'translate-x-4' : 'translate-x-1'
                }`}
              />
            </button>
            <span className="text-sm text-gray-700">{isActive ? 'Active' : 'Inactive'}</span>
          </div>

          {detailsError && (
            <p role="alert" className="text-sm text-red-600">{detailsError}</p>
          )}
          {detailsSuccess && (
            <p className="text-sm text-green-600">Saved!</p>
          )}

          <button
            type="submit"
            disabled={isSavingDetails}
            className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50"
          >
            {isSavingDetails ? 'Saving…' : 'Save Details'}
          </button>
        </form>
      </div>

      {/* ── Slot Geometry Editor ──────────────────────────────────────── */}
      <div className="bg-white rounded-lg border border-gray-200 p-5">
        <h2 className="text-sm font-semibold text-gray-900 mb-1">Slot Geometry</h2>
        <p className="text-xs text-gray-500 mb-4">
          Define the photo slot positions in pixel coordinates (relative to the 600×1800 canvas).
          Preview updates live as you type.
        </p>

        <SlotGeometryEditor
          slots={slots}
          thumbnailUrl={thumbnailUrl}
          onChange={setSlots}
          onSave={(fractionalSlots) => void handleSaveSlots(fractionalSlots)}
          isSaving={isSavingSlots}
        />

        {slotsError && (
          <p role="alert" className="mt-3 text-sm text-red-600">{slotsError}</p>
        )}
        {slotsSuccess && (
          <p className="mt-3 text-sm text-green-600">Slot geometry saved!</p>
        )}
      </div>

      {/* Back link */}
      <div>
        <button
          type="button"
          onClick={() => router.push(`/admin/frames?eventId=${eventId}`)}
          className="text-sm text-gray-500 hover:text-gray-700"
        >
          ← Back to Frames
        </button>
      </div>
    </div>
  );
}
