/**
 * Preservation Property Tests — Task 2
 *
 * Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5
 *
 * These tests observe and confirm baseline behavior on the CURRENT (unfixed) code.
 * ALL tests MUST PASS on unfixed code — this establishes the baseline behavior
 * that must be preserved after fixes are applied in Task 3.
 *
 * Property 2: Preservation — Validasi Form dan Perilaku Non-Upload
 */

import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import FrameUploadForm from '../FrameUploadForm';

// ── Mock next/navigation so the component can render in jsdom ─────────────────
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    refresh: vi.fn(),
  }),
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Create a fake File object with a given name and MIME type.
 * jsdom's File constructor is minimal — name and type are the important parts.
 */
function makeFile(name: string, type: string = ''): File {
  return new File(['data'], name, { type });
}

/**
 * Simulate selecting a file in the hidden <input type="file"> element.
 */
function selectFile(input: HTMLInputElement, file: File) {
  Object.defineProperty(input, 'files', {
    value: [file],
    writable: false,
    configurable: true,
  });
  fireEvent.change(input);
}

// ── Test Suite 1 — Non-PNG Rejection Preservation ─────────────────────────────
//
// Property: for ALL non-PNG filenames (any extension that is not `.png`),
// handleFileChange must set error = "Only PNG files are accepted for frames."
// and leave file state as null.
//
// Requirements: 3.1

describe('Preservation 1 — Non-PNG files are always rejected', () => {
  it('rejects a .jpg file with the correct error message', () => {
    render(<FrameUploadForm eventId="evt-1" />);
    const input = screen.getByLabelText(/frame png/i) as HTMLInputElement;

    selectFile(input, makeFile('photo.jpg', 'image/jpeg'));

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Only PNG files are accepted for frames.',
    );
  });

  it('rejects a .gif file', () => {
    render(<FrameUploadForm eventId="evt-2" />);
    const input = screen.getByLabelText(/frame png/i) as HTMLInputElement;

    selectFile(input, makeFile('anim.gif', 'image/gif'));

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Only PNG files are accepted for frames.',
    );
  });

  it('rejects a .webp file', () => {
    render(<FrameUploadForm eventId="evt-3" />);
    const input = screen.getByLabelText(/frame png/i) as HTMLInputElement;

    selectFile(input, makeFile('image.webp', 'image/webp'));

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Only PNG files are accepted for frames.',
    );
  });

  it('rejects a .txt file', () => {
    render(<FrameUploadForm eventId="evt-4" />);
    const input = screen.getByLabelText(/frame png/i) as HTMLInputElement;

    selectFile(input, makeFile('notes.txt', 'text/plain'));

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Only PNG files are accepted for frames.',
    );
  });

  it('rejects a .pdf file', () => {
    render(<FrameUploadForm eventId="evt-5" />);
    const input = screen.getByLabelText(/frame png/i) as HTMLInputElement;

    selectFile(input, makeFile('document.pdf', 'application/pdf'));

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Only PNG files are accepted for frames.',
    );
  });

  it('rejects a .bmp file', () => {
    render(<FrameUploadForm eventId="evt-6" />);
    const input = screen.getByLabelText(/frame png/i) as HTMLInputElement;

    selectFile(input, makeFile('bitmap.bmp', 'image/bmp'));

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Only PNG files are accepted for frames.',
    );
  });

  it('rejects a .svg file', () => {
    render(<FrameUploadForm eventId="evt-7" />);
    const input = screen.getByLabelText(/frame png/i) as HTMLInputElement;

    selectFile(input, makeFile('vector.svg', 'image/svg+xml'));

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Only PNG files are accepted for frames.',
    );
  });

  /**
   * Property-based test: for any filename whose lowercased form does NOT end
   * with ".png", the component must show the rejection error.
   *
   * Validates: Requirements 3.1
   */
  it('property: rejects all non-PNG extensions (fast-check)', () => {
    // Arbitrary filenames that don't end with .png
    const nonPngName = fc.string({ minLength: 1, maxLength: 20 }).filter(
      (s) =>
        s.trim().length > 0 &&
        !s.toLowerCase().endsWith('.png') &&
        // Avoid names with path separators or null bytes that jsdom may reject
        !/[/\\\0]/.test(s),
    );

    fc.assert(
      fc.property(nonPngName, (name) => {
        const { unmount } = render(<FrameUploadForm eventId="evt-pbt" />);
        const input = screen.getByLabelText(/frame png/i) as HTMLInputElement;

        selectFile(input, makeFile(name, ''));

        const alert = screen.queryByRole('alert');
        const hasError =
          alert?.textContent?.includes('Only PNG files are accepted for frames.') ?? false;

        unmount();
        return hasError;
      }),
      { numRuns: 50 },
    );
  });
});

// ── Test Suite 2 — PNG Files Are Accepted ─────────────────────────────────────
//
// Property: files ending with .png (case-insensitive) must be accepted —
// no error shown, file state is populated.
//
// Requirements: 3.1 (inverse — valid input should pass through)

describe('Preservation 2 — PNG files are accepted', () => {
  it('accepts a lowercase .png file without showing an error', () => {
    render(<FrameUploadForm eventId="evt-8" />);
    const input = screen.getByLabelText(/frame png/i) as HTMLInputElement;

    selectFile(input, makeFile('frame.png', 'image/png'));

    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('accepts an uppercase .PNG file without showing an error', () => {
    render(<FrameUploadForm eventId="evt-9" />);
    const input = screen.getByLabelText(/frame png/i) as HTMLInputElement;

    selectFile(input, makeFile('FRAME.PNG', 'image/png'));

    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('accepts a mixed-case .Png file without showing an error', () => {
    render(<FrameUploadForm eventId="evt-10" />);
    const input = screen.getByLabelText(/frame png/i) as HTMLInputElement;

    selectFile(input, makeFile('Frame.Png', 'image/png'));

    expect(screen.queryByRole('alert')).toBeNull();
  });
});

// ── Test Suite 3 — Disabled Button When No File Selected ──────────────────────
//
// Property: the submit button must be disabled when no file is selected.
// It must become enabled once a valid PNG file is selected.
//
// Requirements: 3.2

describe('Preservation 3 — Submit button disabled when no file selected', () => {
  it('button is disabled on initial render (no file)', () => {
    render(<FrameUploadForm eventId="evt-11" />);
    const button = screen.getByRole('button', { name: /upload frame/i });
    expect(button).toBeDisabled();
  });

  it('button becomes enabled after selecting a PNG file', () => {
    render(<FrameUploadForm eventId="evt-12" />);
    const input = screen.getByLabelText(/frame png/i) as HTMLInputElement;
    const button = screen.getByRole('button', { name: /upload frame/i });

    selectFile(input, makeFile('frame.png', 'image/png'));

    expect(button).toBeEnabled();
  });

  it('button remains disabled after selecting a non-PNG file', () => {
    render(<FrameUploadForm eventId="evt-13" />);
    const input = screen.getByLabelText(/frame png/i) as HTMLInputElement;
    const button = screen.getByRole('button', { name: /upload frame/i });

    selectFile(input, makeFile('photo.jpg', 'image/jpeg'));

    expect(button).toBeDisabled();
  });

  /**
   * Property-based: for any number of non-PNG file selections in sequence,
   * the button must always remain disabled.
   *
   * Validates: Requirements 3.2
   */
  it('property: button always disabled after any non-PNG file (fast-check)', () => {
    const nonPngName = fc.string({ minLength: 1, maxLength: 20 }).filter(
      (s) =>
        s.trim().length > 0 &&
        !s.toLowerCase().endsWith('.png') &&
        !/[/\\\0]/.test(s),
    );

    fc.assert(
      fc.property(nonPngName, (name) => {
        const { unmount } = render(<FrameUploadForm eventId="evt-pbt2" />);
        const input = screen.getByLabelText(/frame png/i) as HTMLInputElement;
        const button = screen.getByRole('button', { name: /upload frame/i });

        selectFile(input, makeFile(name, ''));

        const isDisabled = (button as HTMLButtonElement).disabled;
        unmount();
        return isDisabled;
      }),
      { numRuns: 30 },
    );
  });
});

// ── Test Suite 4 — Empty Frame Name Validation ────────────────────────────────
//
// Property: submitting the form with a PNG file selected but an empty or
// whitespace-only frame name must show "Frame name is required." and prevent
// the upload from starting.
//
// Requirements: 3.3

describe('Preservation 4 — Empty frame name validation', () => {
  beforeEach(() => {
    // Prevent fetch calls from leaking into other tests
    vi.stubGlobal('fetch', vi.fn());
  });

  it('shows "Frame name is required." when name is empty and form is submitted', async () => {
    render(<FrameUploadForm eventId="evt-14" />);
    const input = screen.getByLabelText(/frame png/i) as HTMLInputElement;

    // Select a valid PNG so the button is enabled
    selectFile(input, makeFile('frame.png', 'image/png'));

    // Clear the auto-filled name
    const nameInput = screen.getByLabelText(/frame name/i) as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: '' } });

    const button = screen.getByRole('button', { name: /upload frame/i });
    fireEvent.click(button);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Frame name is required.');
    });
  });

  it('shows "Frame name is required." when name is whitespace-only', async () => {
    render(<FrameUploadForm eventId="evt-15" />);
    const input = screen.getByLabelText(/frame png/i) as HTMLInputElement;

    selectFile(input, makeFile('frame.png', 'image/png'));

    const nameInput = screen.getByLabelText(/frame name/i) as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: '   ' } });

    const button = screen.getByRole('button', { name: /upload frame/i });
    fireEvent.click(button);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Frame name is required.');
    });
  });

  /**
   * Property-based: for any string that is empty or trims to empty, the form
   * must always show the "Frame name is required." validation error.
   *
   * Validates: Requirements 3.3
   */
  it('property: any whitespace-only frame name triggers validation error (fast-check)', async () => {
    // Generate strings composed only of whitespace characters
    // fc.stringOf was removed; use fc.array + fc.constantFrom and join instead
    const whitespaceOnly = fc
      .array(fc.constantFrom(' ', '\t', '\n', '\r'), { minLength: 0, maxLength: 15 })
      .map((chars) => chars.join(''));

    await fc.assert(
      fc.asyncProperty(whitespaceOnly, async (name) => {
        const { unmount } = render(<FrameUploadForm eventId="evt-pbt3" />);
        const input = screen.getByLabelText(/frame png/i) as HTMLInputElement;

        selectFile(input, makeFile('frame.png', 'image/png'));

        const nameInput = screen.getByLabelText(/frame name/i) as HTMLInputElement;
        fireEvent.change(nameInput, { target: { value: name } });

        const button = screen.getByRole('button', { name: /upload frame/i });

        await act(async () => {
          fireEvent.click(button);
        });

        const alert = screen.queryByRole('alert');
        const hasError =
          alert?.textContent?.includes('Frame name is required.') ?? false;

        unmount();
        return hasError;
      }),
      { numRuns: 20 },
    );
  });
});
