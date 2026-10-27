'use client';

/**
 * PromptsManager — client component for admin prompt template management.
 *
 * Handles:
 *  - Displaying all prompt template versions with active indicator
 *  - "Set Active" button to set the active prompt for the event
 *  - "New Version" editor with a textarea for prompt content
 *  - Preview: upload a test photo + prompt text → call /api/admin/prompts/preview
 *
 * Requirements: 11.6
 */

import React, { useState, useTransition, useRef } from 'react';

interface PromptTemplate {
  id: string;
  event_id: string;
  content: string;
  version: number;
  is_active: boolean;
  created_at: string;
}

interface PromptsManagerProps {
  eventId: string;
  eventName: string;
  initialTemplates: PromptTemplate[];
  initialActiveTemplateId: string | null;
}

function formatDate(isoString: string): string {
  return new Date(isoString).toLocaleString('en-GB', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function PromptsManager({
  eventId,
  eventName: _eventName,
  initialTemplates,
  initialActiveTemplateId,
}: PromptsManagerProps) {
  const [templates, setTemplates] = useState<PromptTemplate[]>(initialTemplates);
  const [activeTemplateId, setActiveTemplateId] = useState<string | null>(initialActiveTemplateId);

  // Editor state
  const [showEditor, setShowEditor] = useState(false);
  const [editorContent, setEditorContent] = useState('');
  const [isSaving, startSaveTransition] = useTransition();
  const [saveError, setSaveError] = useState<string | null>(null);

  // Set-active state
  const [settingActiveId, setSettingActiveId] = useState<string | null>(null);
  const [setActiveError, setSetActiveError] = useState<string | null>(null);

  // Preview state
  const [previewTemplateId, setPreviewTemplateId] = useState<string | null>(null);
  const [previewPhoto, setPreviewPhoto] = useState<File | null>(null);
  const [previewPromptContent, setPreviewPromptContent] = useState<string>('');
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewResult, setPreviewResult] = useState<{ imageBase64: string; mimeType: string } | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);

  // ── Save new version ─────────────────────────────────────────────────────

  function handleNewVersion() {
    setShowEditor(true);
    setEditorContent('');
    setSaveError(null);
  }

  function handleCancelEditor() {
    setShowEditor(false);
    setEditorContent('');
    setSaveError(null);
  }

  function handleSaveVersion() {
    if (!editorContent.trim()) {
      setSaveError('Prompt content cannot be empty.');
      return;
    }

    startSaveTransition(async () => {
      setSaveError(null);
      try {
        const res = await fetch('/api/admin/prompts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ eventId, content: editorContent.trim() }),
        });

        if (!res.ok) {
          const body = (await res.json()) as { error?: string };
          setSaveError(body.error ?? 'Failed to save prompt version.');
          return;
        }

        // Refresh the template list
        const listRes = await fetch(`/api/admin/prompts?eventId=${encodeURIComponent(eventId)}`);
        if (listRes.ok) {
          const { templates: updated, activePromptTemplateId } = (await listRes.json()) as {
            templates: PromptTemplate[];
            activePromptTemplateId: string | null;
          };
          setTemplates(updated);
          setActiveTemplateId(activePromptTemplateId);
        }

        setShowEditor(false);
        setEditorContent('');
      } catch {
        setSaveError('Network error. Please try again.');
      }
    });
  }

  // ── Set active ───────────────────────────────────────────────────────────

  async function handleSetActive(templateId: string) {
    setSettingActiveId(templateId);
    setSetActiveError(null);
    try {
      const res = await fetch(`/api/admin/prompts/${encodeURIComponent(templateId)}/set-active`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventId }),
      });

      if (!res.ok) {
        const body = (await res.json()) as { error?: string };
        setSetActiveError(body.error ?? 'Failed to set active template.');
        return;
      }

      setActiveTemplateId(templateId);
    } catch {
      setSetActiveError('Network error. Please try again.');
    } finally {
      setSettingActiveId(null);
    }
  }

  // ── Preview ──────────────────────────────────────────────────────────────

  function handleOpenPreview(template: PromptTemplate) {
    setPreviewTemplateId(template.id);
    setPreviewPromptContent(template.content);
    setPreviewPhoto(null);
    setPreviewResult(null);
    setPreviewError(null);
    if (photoInputRef.current) {
      photoInputRef.current.value = '';
    }
  }

  function handleClosePreview() {
    setPreviewTemplateId(null);
    setPreviewPhoto(null);
    setPreviewResult(null);
    setPreviewError(null);
  }

  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    setPreviewPhoto(file);
    setPreviewResult(null);
    setPreviewError(null);
  }

  async function handleRunPreview() {
    if (!previewPhoto) {
      setPreviewError('Please select a test photo.');
      return;
    }
    if (!previewPromptContent.trim()) {
      setPreviewError('Prompt content cannot be empty.');
      return;
    }

    setPreviewLoading(true);
    setPreviewResult(null);
    setPreviewError(null);

    try {
      const form = new FormData();
      form.append('photo', previewPhoto);
      form.append('content', previewPromptContent.trim());

      const res = await fetch('/api/admin/prompts/preview', {
        method: 'POST',
        body: form,
      });

      const body = await res.json() as Record<string, unknown>;

      if (!res.ok) {
        setPreviewError((body.error as string) ?? 'Preview generation failed.');
        return;
      }

      setPreviewResult({
        imageBase64: body.imageBase64 as string,
        mimeType: body.mimeType as string,
      });
    } catch {
      setPreviewError('Network error during preview. Please try again.');
    } finally {
      setPreviewLoading(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const previewTemplate = templates.find((t) => t.id === previewTemplateId);

  return (
    <div className="space-y-6">
      {/* Version List */}
      <div className="bg-white rounded-lg border border-gray-200">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-900">
            Versions ({templates.length})
          </h2>
          <button
            onClick={handleNewVersion}
            className="inline-flex items-center gap-1.5 rounded-md bg-gray-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-900"
          >
            + New Version
          </button>
        </div>

        {setActiveError && (
          <div className="mx-5 mt-3 rounded-md bg-red-50 border border-red-200 px-4 py-2 text-xs text-red-700">
            {setActiveError}
          </div>
        )}

        {templates.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm text-gray-400">
            No prompt templates yet. Create the first version above.
          </div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {templates.map((template) => {
              const isActive = template.id === activeTemplateId;
              const isSettingThis = settingActiveId === template.id;

              return (
                <li key={template.id} className="px-5 py-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-medium text-gray-900">
                          Version {template.version}
                        </span>
                        {isActive && (
                          <span className="inline-flex items-center rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700 ring-1 ring-inset ring-green-600/20">
                            Active
                          </span>
                        )}
                        <span className="text-xs text-gray-400">
                          {formatDate(template.created_at)}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 font-mono whitespace-pre-wrap line-clamp-3 leading-relaxed">
                        {template.content}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => handleOpenPreview(template)}
                        className="rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-900"
                      >
                        Preview
                      </button>
                      {!isActive && (
                        <button
                          onClick={() => handleSetActive(template.id)}
                          disabled={isSettingThis}
                          className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                        >
                          {isSettingThis ? 'Setting…' : 'Set Active'}
                        </button>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* New Version Editor */}
      {showEditor && (
        <div className="bg-white rounded-lg border border-gray-200 p-5">
          <h2 className="text-sm font-semibold text-gray-900 mb-3">New Version</h2>
          <textarea
            value={editorContent}
            onChange={(e) => setEditorContent(e.target.value)}
            rows={8}
            placeholder="Enter your prompt text here. Describe the style, medium, and output format for the AI sketch generation."
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm font-mono text-gray-900 placeholder-gray-400 focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900 resize-y"
          />
          {saveError && (
            <p className="mt-2 text-xs text-red-600">{saveError}</p>
          )}
          <div className="mt-3 flex items-center gap-3">
            <button
              onClick={handleSaveVersion}
              disabled={isSaving}
              className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-900"
            >
              {isSaving ? 'Saving…' : 'Save Version'}
            </button>
            <button
              onClick={handleCancelEditor}
              disabled={isSaving}
              className="rounded-md border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-900"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Preview Panel */}
      {previewTemplateId && previewTemplate && (
        <div className="bg-white rounded-lg border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-900">
              Preview — Version {previewTemplate.version}
            </h2>
            <button
              onClick={handleClosePreview}
              className="text-sm text-gray-400 hover:text-gray-700 focus:outline-none"
              aria-label="Close preview"
            >
              ✕
            </button>
          </div>

          <div className="space-y-4">
            {/* Editable prompt for this preview run */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Prompt (editable for this preview)
              </label>
              <textarea
                value={previewPromptContent}
                onChange={(e) => setPreviewPromptContent(e.target.value)}
                rows={5}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm font-mono text-gray-900 focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900 resize-y"
              />
            </div>

            {/* Photo upload */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Test Photo
              </label>
              <input
                ref={photoInputRef}
                type="file"
                accept="image/jpeg,image/jpg,image/png,image/webp"
                onChange={handlePhotoChange}
                className="block w-full text-sm text-gray-500 file:mr-3 file:rounded-md file:border-0 file:bg-gray-100 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-gray-700 hover:file:bg-gray-200"
              />
              {previewPhoto && (
                <p className="mt-1 text-xs text-gray-400">{previewPhoto.name}</p>
              )}
            </div>

            {/* Run button */}
            <div>
              <button
                onClick={handleRunPreview}
                disabled={previewLoading || !previewPhoto}
                className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
              >
                {previewLoading ? (
                  <>
                    <svg
                      className="h-4 w-4 animate-spin"
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                      />
                    </svg>
                    Generating…
                  </>
                ) : (
                  'Run Preview'
                )}
              </button>
              {!previewPhoto && (
                <span className="ml-3 text-xs text-gray-400">Select a test photo first.</span>
              )}
            </div>

            {/* Error */}
            {previewError && (
              <div className="rounded-md bg-red-50 border border-red-200 px-4 py-2 text-xs text-red-700">
                {previewError}
              </div>
            )}

            {/* Result */}
            {previewResult && (
              <div>
                <p className="text-xs font-medium text-gray-700 mb-2">Generated Sketch:</p>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`data:${previewResult.mimeType};base64,${previewResult.imageBase64}`}
                  alt="AI-generated sketch preview"
                  className="max-w-xs rounded-lg border border-gray-200 shadow-sm"
                  style={{ maxHeight: '600px', objectFit: 'contain' }}
                />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
