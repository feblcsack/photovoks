'use client';

/**
 * Shared Event form component used by both Create and Edit pages.
 * Requirements: 11.6
 */
import React, { useState } from 'react';
import { useRouter } from 'next/navigation';

export interface EventFormValues {
  name: string;
  status: 'draft' | 'active' | 'archived';
  retentionDays: number;
  dailySketchCap: number;
  tearLineOffsetPx: number;
}

interface EventFormProps {
  /** When provided, the form PATCHes the existing event. When absent, POSTs a new one. */
  eventId?: string;
  initialValues?: Partial<EventFormValues>;
  /** When true (edit mode), shows "Switch to Active" button separately */
  isEdit?: boolean;
}

const defaultValues: EventFormValues = {
  name: '',
  status: 'draft',
  retentionDays: 30,
  dailySketchCap: 50,
  tearLineOffsetPx: 0,
};

export default function EventForm({ eventId, initialValues, isEdit = false }: EventFormProps) {
  const router = useRouter();
  const [values, setValues] = useState<EventFormValues>({
    ...defaultValues,
    ...initialValues,
  });
  const [isSaving, setIsSaving] = useState(false);
  const [isActivating, setIsActivating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activateError, setActivateError] = useState<string | null>(null);

  function handleChange(field: keyof EventFormValues, value: string | number) {
    setValues((v) => ({ ...v, [field]: value }));
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!values.name.trim()) {
      setError('Event name is required.');
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      const url = isEdit && eventId ? `/api/admin/events/${eventId}` : '/api/admin/events';
      const method = isEdit ? 'PATCH' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });

      const data = await res.json() as { error?: string; eventId?: string; code?: string };

      if (!res.ok) {
        if (data.code === 'ACTIVE_SESSION_CONFLICT') {
          setError('Cannot switch to Active while a visitor session is in progress. Wait for all active sessions to complete.');
        } else {
          setError(data.error ?? 'Failed to save event');
        }
        return;
      }

      if (!isEdit && data.eventId) {
        router.push(`/admin/events/${data.eventId}`);
      } else {
        router.push('/admin/events');
        router.refresh();
      }
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleSwitchToActive() {
    if (!eventId) return;
    setIsActivating(true);
    setActivateError(null);

    try {
      const res = await fetch(`/api/admin/events/${eventId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'active' }),
      });

      const data = await res.json() as { error?: string; code?: string };

      if (!res.ok) {
        if (data.code === 'ACTIVE_SESSION_CONFLICT') {
          setActivateError(
            'Cannot switch to Active while a visitor session is in progress. Wait for all sessions to complete first.'
          );
        } else {
          setActivateError(data.error ?? 'Failed to activate event');
        }
        return;
      }

      router.push('/admin/events');
      router.refresh();
    } catch {
      setActivateError('Network error. Please try again.');
    } finally {
      setIsActivating(false);
    }
  }

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="space-y-5 max-w-lg">
      {/* Name */}
      <div>
        <label htmlFor="event-name" className="block text-sm font-medium text-gray-700 mb-1">
          Event Name <span className="text-red-500">*</span>
        </label>
        <input
          id="event-name"
          type="text"
          required
          value={values.name}
          onChange={(e) => handleChange('name', e.target.value)}
          placeholder="e.g. Wedding of Budi & Sari"
          className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500"
        />
      </div>

      {/* Status (shown on create; on edit, status switching is via the dedicated button) */}
      {!isEdit && (
        <div>
          <label htmlFor="event-status" className="block text-sm font-medium text-gray-700 mb-1">
            Initial Status
          </label>
          <select
            id="event-status"
            value={values.status}
            onChange={(e) => handleChange('status', e.target.value as EventFormValues['status'])}
            className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500"
          >
            <option value="draft">Draft</option>
            <option value="active">Active</option>
            <option value="archived">Archived</option>
          </select>
        </div>
      )}

      {/* Retention Days */}
      <div>
        <label htmlFor="retention-days" className="block text-sm font-medium text-gray-700 mb-1">
          Retention Period (days)
        </label>
        <input
          id="retention-days"
          type="number"
          min={1}
          max={365}
          value={values.retentionDays}
          onChange={(e) => handleChange('retentionDays', parseInt(e.target.value, 10) || 30)}
          className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500"
        />
        <p className="mt-1 text-xs text-gray-500">
          Session assets are auto-deleted after this many days.
        </p>
      </div>

      {/* Daily Sketch Cap */}
      <div>
        <label htmlFor="daily-sketch-cap" className="block text-sm font-medium text-gray-700 mb-1">
          Daily Sketch Cap
        </label>
        <input
          id="daily-sketch-cap"
          type="number"
          min={0}
          value={values.dailySketchCap}
          onChange={(e) => handleChange('dailySketchCap', parseInt(e.target.value, 10) || 0)}
          className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500"
        />
        <p className="mt-1 text-xs text-gray-500">
          Maximum AI sketch generations per day. Set to 0 to disable sketches.
        </p>
      </div>

      {/* Tear Line Offset */}
      <div>
        <label htmlFor="tear-line" className="block text-sm font-medium text-gray-700 mb-1">
          Tear Line Offset (px)
        </label>
        <input
          id="tear-line"
          type="number"
          value={values.tearLineOffsetPx}
          onChange={(e) => handleChange('tearLineOffsetPx', parseInt(e.target.value, 10) || 0)}
          className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500"
        />
        <p className="mt-1 text-xs text-gray-500">
          Adjustment from the default 602 px sheet tear line. Positive moves right.
        </p>
      </div>

      {/* Global save error */}
      {error && (
        <div
          role="alert"
          className="rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700"
        >
          {error}
        </div>
      )}

      {/* Form actions */}
      <div className="flex items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={isSaving}
          className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-900"
        >
          {isSaving ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Event'}
        </button>

        {/* "Switch to Active" button — only in edit mode, not for already-active/archived */}
        {isEdit && eventId && values.status !== 'active' && values.status !== 'archived' && (
          <button
            type="button"
            onClick={() => void handleSwitchToActive()}
            disabled={isActivating}
            className="rounded-md bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-600 disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-green-700"
          >
            {isActivating ? 'Activating…' : 'Switch to Active'}
          </button>
        )}
      </div>

      {/* Activate conflict error shown separately below the button */}
      {activateError && (
        <div
          role="alert"
          className="rounded-md bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800"
        >
          {activateError}
        </div>
      )}
    </form>
  );
}
