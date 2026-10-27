'use client';

/**
 * FrameUploadForm
 *
 * 1. User selects (or drops) a PNG file
 * 2. Client POSTs to /api/admin/frames/upload-url to get a signed upload URL + storagePath
 * 3. Client PUTs the file directly to Supabase Storage via the signed URL
 * 4. Client POSTs to /api/admin/frames to create the DB record
 * 5. Redirects to the edit page so the user can configure slots
 *
 * Requirements: 11.6, 11.8
 */
import React, { useId, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

interface FrameUploadFormProps {
  eventId: string;
}

type ApiError = { error?: string };

// ---------- helpers ----------

function generateFrameId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback for older environments
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

/**
 * Validate by extension (MIME can be empty or wrong on some OS/browsers),
 * and additionally reject when MIME is present and clearly not PNG.
 */
function validatePng(file: File): string | null {
  const isExtPng = file.name.toLowerCase().endsWith('.png');
  const isMimeWrong = file.type !== '' && file.type !== 'image/png';
  return !isExtPng || isMimeWrong ? 'Only PNG files are accepted for frames.' : null;
}

function nameFromFilename(filename: string): string {
  return filename.replace(/\.png$/i, '').replace(/_/g, ' ');
}

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Throws a readable Error if the response is not ok, otherwise returns parsed JSON. */
async function parseJsonOrThrow<T>(res: Response, fallbackMessage: string): Promise<T> {
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as ApiError;
    throw new Error(data.error ?? fallbackMessage);
  }
  return (await res.json()) as T;
}

// ---------- component ----------

export default function FrameUploadForm({ eventId }: FrameUploadFormProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const nameId = useId();
  const fileId = useId();

  const [frameName, setFrameName] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function selectFile(f: File | null) {
    if (f) {
      const validationError = validatePng(f);
      if (validationError) {
        setError(validationError);
        setFile(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
        return;
      }
    }
    setFile(f);
    setError(null);
    // Auto-fill name from filename if empty
    if (f && !frameName.trim()) {
      setFrameName(nameFromFilename(f.name));
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    selectFile(e.target.files?.[0] ?? null);
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragging(false);
    if (isUploading) return;
    selectFile(e.dataTransfer.files?.[0] ?? null);
  }

  function handleDragOver(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    if (!isUploading) setIsDragging(true);
  }

  function resetForm() {
    setFrameName('');
    setFile(null);
    setProgress(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (isUploading) return;

    if (!file) {
      setError('Please select a PNG file.');
      return;
    }
    if (!frameName.trim()) {
      setError('Frame name is required.');
      return;
    }

    setIsUploading(true);
    setError(null);

    try {
      // Step 1: get signed upload URL
      setProgress('Requesting upload URL…');
      const frameId = generateFrameId();

      const urlRes = await fetch('/api/admin/frames/upload-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ frameId }),
      });
      const { signedUrl, storagePath } = await parseJsonOrThrow<{
        signedUrl: string;
        storagePath: string;
      }>(urlRes, 'Failed to get upload URL');

      // Step 2: upload directly to Supabase Storage
      setProgress('Uploading PNG…');
      const uploadRes = await fetch(signedUrl, {
        method: 'PUT',
        headers: { 'Content-Type': 'image/png' },
        body: file,
      });

      if (!uploadRes.ok) {
        const body = await uploadRes.text().catch(() => '');
        const detail = `HTTP ${uploadRes.status}${body ? `: ${body}` : ''}`;
        throw new Error(`Failed to upload frame PNG to storage (${detail})`);
      }

      // Step 3: create DB record
      setProgress('Creating frame record…');
      const createRes = await fetch('/api/admin/frames', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventId,
          name: frameName.trim(),
          storagePath,
          slotGeometry: [],
        }),
      });
      const { frameId: createdFrameId } = await parseJsonOrThrow<{ frameId: string }>(
        createRes,
        'Failed to create frame record',
      );

      resetForm();

      // Redirect to edit page so user can configure slots
      router.push(`/admin/frames/${createdFrameId}/edit?eventId=${eventId}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
      setProgress(null);
    } finally {
      setIsUploading(false);
    }
  }

  const canSubmit = !!file && !isUploading;

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4" noValidate>
      <div className="flex gap-4 items-end flex-wrap">
        {/* Frame name */}
        <div className="flex-1 min-w-48">
          <label htmlFor={nameId} className="block text-xs font-medium text-gray-700 mb-1">
            Frame Name
          </label>
          <input
            id={nameId}
            type="text"
            value={frameName}
            disabled={isUploading}
            onChange={(e) => {
              setFrameName(e.target.value);
              setError(null);
            }}
            placeholder="e.g. Classic White Border"
            className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500 disabled:bg-gray-50 disabled:cursor-not-allowed"
          />
        </div>

        {/* PNG picker + dropzone */}
        <div className="flex-1 min-w-64">
          <label htmlFor={fileId} className="block text-xs font-medium text-gray-700 mb-1">
            Frame PNG (600×1800)
          </label>

          {/* Real input stays in the DOM (form semantics, a11y), visually hidden */}
          <input
            id={fileId}
            ref={fileInputRef}
            type="file"
            accept="image/png,.png"
            onChange={handleFileChange}
            disabled={isUploading}
            className="sr-only"
          />

          <div
            onDragOver={handleDragOver}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            className={`flex items-center gap-3 rounded-md border border-dashed px-3 py-2 transition-colors ${
              isDragging ? 'border-gray-900 bg-gray-50' : 'border-gray-300'
            }`}
          >
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className="cursor-pointer rounded bg-gray-100 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {file ? 'Change file' : 'Choose file'}
            </button>
            <span className="truncate text-sm text-gray-600" title={file?.name}>
              {file ? `${file.name} (${formatSize(file.size)})` : 'or drop a PNG here'}
            </span>
          </div>
        </div>

        <button
          type="submit"
          disabled={!canSubmit}
          className="cursor-pointer rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2 whitespace-nowrap disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isUploading ? (progress ?? 'Uploading…') : 'Upload Frame'}
        </button>
      </div>

      {!file && !isUploading && (
        <p className="text-xs text-gray-400">Pilih file PNG untuk mengaktifkan tombol upload.</p>
      )}

      <div aria-live="polite" className="sr-only">
        {progress}
      </div>

      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
    </form>
  );
}