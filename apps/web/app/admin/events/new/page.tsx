/**
 * Admin Event Create page — /admin/events/new
 * Requirements: 11.6
 */
import React from 'react';
import Link from 'next/link';
import EventForm from '../EventForm';

export default function NewEventPage() {
  return (
    <div>
      <div className="mb-6">
        <Link
          href="/admin/events"
          className="text-sm text-gray-500 hover:text-gray-700"
        >
          ← Events
        </Link>
        <h1 className="mt-2 text-xl font-semibold text-gray-900">New Event</h1>
        <p className="mt-1 text-sm text-gray-500">
          Create a new photobooth rental event.
        </p>
      </div>

      <EventForm />
    </div>
  );
}
