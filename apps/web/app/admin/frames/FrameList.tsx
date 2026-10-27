'use client';

/**
 * FrameList — interactive list of frames with reorder, toggle, and soft-delete.
 *
 * Reorder: up/down buttons that swap sort_order values and PATCH via API.
 * Deactivate: toggle is_active.
 * Soft-delete: calls DELETE /api/admin/frames/[frameId] (sets is_active=false).
 *
 * Requirements: 11.6
 */
import React, { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';

interface FrameRow {
  id: string;
  event_id: string;
  name: string;
  storage_path: string;
  slot_geometry: unknown;
  is_active: boolean;
  sort_order: number;
  thumbnailUrl: string | null;
}

interface FrameListProps {
  frames: FrameRow[];
  eventId: string;
}

export default function FrameList({ frames: initialFrames, eventId }: FrameListProps) {
  const router = useRouter();
  const [frames, setFrames] = useState<FrameRow[]>(initialFrames);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function patchFrame(frameId: string, payload: Record<string, unknown>) {
    const res = await fetch(`/api/admin/frames/${frameId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const data = await res.json() as { error?: string };
      throw new Error(data.error ?? 'Update failed');
    }
  }

  async function handleToggleActive(frame: FrameRow) {
    setLoadingId(frame.id);
    setError(null);
    try {
      await patchFrame(frame.id, { isActive: !frame.is_active });
      setFrames((prev) =>
        prev.map((f) => (f.id === frame.id ? { ...f, is_active: !f.is_active } : f))
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update frame');
    } finally {
      setLoadingId(null);
    }
  }

  async function handleDelete(frame: FrameRow) {
    if (!confirm(`Deactivate frame "${frame.name}"?`)) return;
    setLoadingId(frame.id);
    setError(null);
    try {
      const res = await fetch(`/api/admin/frames/${frame.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json() as { error?: string };
        throw new Error(data.error ?? 'Delete failed');
      }
      setFrames((prev) => prev.filter((f) => f.id !== frame.id));
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete frame');
    } finally {
      setLoadingId(null);
    }
  }

  async function handleMove(index: number, direction: 'up' | 'down') {
    const swapIndex = direction === 'up' ? index - 1 : index + 1;
    if (swapIndex < 0 || swapIndex >= frames.length) return;

    const updated = [...frames];
    // Swap sort_order values
    const tempOrder = updated[index].sort_order;
    updated[index] = { ...updated[index], sort_order: updated[swapIndex].sort_order };
    updated[swapIndex] = { ...updated[swapIndex], sort_order: tempOrder };
    // Swap positions in array
    [updated[index], updated[swapIndex]] = [updated[swapIndex], updated[index]];

    setFrames(updated);
    setError(null);

    try {
      await fetch('/api/admin/frames/reorder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          frames: updated.map((f) => ({ id: f.id, sortOrder: f.sort_order })),
        }),
      });
    } catch {
      setError('Failed to save order');
      // Revert on error
      setFrames(initialFrames);
    }
  }

  return (
    <div>
      {error && (
        <div role="alert" className="mb-4 rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <ul className="space-y-3">
        {frames.map((frame, index) => {
          const slotCount = Array.isArray(frame.slot_geometry) ? frame.slot_geometry.length : 0;
          const isLoading = loadingId === frame.id;

          return (
            <li
              key={frame.id}
              className={`flex items-center gap-4 p-3 rounded-lg border ${
                frame.is_active ? 'border-gray-200 bg-white' : 'border-gray-100 bg-gray-50 opacity-60'
              }`}
            >
              {/* Thumbnail */}
              <div className="w-12 h-16 flex-shrink-0 bg-gray-100 rounded overflow-hidden border border-gray-200">
                {frame.thumbnailUrl ? (
                  <Image
                    src={frame.thumbnailUrl}
                    alt={frame.name}
                    width={48}
                    height={64}
                    className="w-full h-full object-cover"
                    unoptimized
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-gray-300 text-xs">
                    PNG
                  </div>
                )}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{frame.name}</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {slotCount} slot{slotCount !== 1 ? 's' : ''} · Sort #{frame.sort_order}
                  {!frame.is_active && <span className="ml-1 text-amber-600">Inactive</span>}
                </p>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1.5 flex-shrink-0">
                {/* Reorder */}
                <button
                  type="button"
                  onClick={() => void handleMove(index, 'up')}
                  disabled={index === 0 || isLoading}
                  aria-label="Move up"
                  className="rounded p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 disabled:opacity-30"
                >
                  ▲
                </button>
                <button
                  type="button"
                  onClick={() => void handleMove(index, 'down')}
                  disabled={index === frames.length - 1 || isLoading}
                  aria-label="Move down"
                  className="rounded p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 disabled:opacity-30"
                >
                  ▼
                </button>

                {/* Edit */}
                <Link
                  href={`/admin/frames/${frame.id}/edit?eventId=${eventId}`}
                  className="rounded px-2 py-1 text-xs font-medium text-gray-700 bg-gray-100 hover:bg-gray-200"
                >
                  Edit
                </Link>

                {/* Toggle active */}
                <button
                  type="button"
                  onClick={() => void handleToggleActive(frame)}
                  disabled={isLoading}
                  className={`rounded px-2 py-1 text-xs font-medium transition-colors disabled:opacity-50 ${
                    frame.is_active
                      ? 'bg-amber-50 text-amber-700 hover:bg-amber-100'
                      : 'bg-green-50 text-green-700 hover:bg-green-100'
                  }`}
                >
                  {isLoading ? '…' : frame.is_active ? 'Deactivate' : 'Activate'}
                </button>

                {/* Delete */}
                <button
                  type="button"
                  onClick={() => void handleDelete(frame)}
                  disabled={isLoading}
                  className="rounded px-2 py-1 text-xs font-medium text-red-700 bg-red-50 hover:bg-red-100 transition-colors disabled:opacity-50"
                >
                  Delete
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
