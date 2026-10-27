'use client';

/**
 * Client component for event row action buttons (Edit, Archive).
 * Requirements: 11.6
 */
import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface EventActionsProps {
  event: {
    id: string;
    name: string;
    status: 'draft' | 'active' | 'archived';
  };
}

export default function EventActions({ event }: EventActionsProps) {
  const router = useRouter();
  const [isArchiving, setIsArchiving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleArchive() {
    if (!confirm(`Archive event "${event.name}"? This will prevent it from being used for new sessions.`)) {
      return;
    }

    setIsArchiving(true);
    setError(null);

    try {
      const res = await fetch(`/api/admin/events/${event.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'archived' }),
      });

      if (!res.ok) {
        const data = await res.json() as { error?: string };
        setError(data.error ?? 'Failed to archive event');
        return;
      }

      router.refresh();
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setIsArchiving(false);
    }
  }

  return (
    <div className="flex items-center justify-end gap-2">
      {error && (
        <span className="text-xs text-red-600">{error}</span>
      )}
      <Link
        href={`/admin/events/${event.id}`}
        className="rounded px-2 py-1 text-xs font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 transition-colors"
      >
        Edit
      </Link>
      {event.status !== 'archived' && (
        <button
          type="button"
          onClick={() => void handleArchive()}
          disabled={isArchiving}
          className="rounded px-2 py-1 text-xs font-medium text-red-700 bg-red-50 hover:bg-red-100 transition-colors disabled:opacity-50"
        >
          {isArchiving ? 'Archiving…' : 'Archive'}
        </button>
      )}
    </div>
  );
}
