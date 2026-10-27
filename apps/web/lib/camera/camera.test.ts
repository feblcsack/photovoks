/**
 * Unit tests for the camera module.
 *
 * `captureFrame` is the only function with testable logic in a jsdom
 * environment. `startCamera` and `stopCamera` wrap browser APIs directly and
 * are exercised by integration tests.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { captureFrame, startCamera, stopCamera } from './index';
import type { SlotGeometry } from '@photovoks/shared-types';

// Capture a reference to the real createElement BEFORE any mocking
const _originalCreateElement = document.createElement.bind(document);

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeSlot(aspectRatio: number): SlotGeometry {
  // A slot occupying the full 600×1800 strip with the given aspect ratio
  const h = 1;
  const w = aspectRatio; // fractional — only aspectRatio matters for captureFrame
  return { x: 0, y: 0, w, h, aspectRatio };
}

function makeVideoElement(videoWidth: number, videoHeight: number): HTMLVideoElement {
  const video = document.createElement('video');
  Object.defineProperty(video, 'videoWidth', { value: videoWidth, configurable: true });
  Object.defineProperty(video, 'videoHeight', { value: videoHeight, configurable: true });
  return video;
}

// ── captureFrame ──────────────────────────────────────────────────────────────

describe('captureFrame', () => {
  // Suppress OffscreenCanvas so we always exercise the HTMLCanvas fallback path
  // (jsdom does not implement OffscreenCanvas)

  it('throws when video has zero dimensions', async () => {
    const video = makeVideoElement(0, 0);
    const slot = makeSlot(1 / 3); // portrait strip slot

    await expect(captureFrame(video, slot)).rejects.toThrow(
      'Video stream has zero dimensions',
    );
  });

  it('resolves to a Blob for a landscape slot on a portrait video', async () => {
    // Set up HTMLCanvasElement.toBlob mock
    const mockBlob = new Blob(['fake-image'], { type: 'image/png' });
    const mockCtx = {
      drawImage: vi.fn(),
    };
    const mockCanvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => mockCtx),
      toBlob: vi.fn((cb: (b: Blob | null) => void) => cb(mockBlob)),
    };

    vi.spyOn(document, 'createElement').mockImplementation((tag) => {
      if (tag === 'canvas') return mockCanvas as unknown as HTMLCanvasElement;
      return _originalCreateElement(tag);
    });

    const video = makeVideoElement(480, 640); // portrait video
    const slot = makeSlot(4 / 3);            // landscape crop aspect

    const result = await captureFrame(video, slot);
    expect(result).toBe(mockBlob);

    vi.restoreAllMocks();
  });

  it('crops width-limited when video is wider than the slot aspect ratio', async () => {
    const mockBlob = new Blob(['x'], { type: 'image/png' });
    let capturedWidth = 0;
    let capturedHeight = 0;

    const mockCtx = { drawImage: vi.fn() };
    const mockCanvas = {
      get width() { return capturedWidth; },
      set width(v: number) { capturedWidth = v; },
      get height() { return capturedHeight; },
      set height(v: number) { capturedHeight = v; },
      getContext: vi.fn(() => mockCtx),
      toBlob: vi.fn((cb: (b: Blob | null) => void) => cb(mockBlob)),
    };

    vi.spyOn(document, 'createElement').mockImplementation((tag) => {
      if (tag === 'canvas') return mockCanvas as unknown as HTMLCanvasElement;
      return _originalCreateElement(tag);
    });

    // Video: 1920×1080 (16:9 ≈ 1.78 ratio)
    // Slot: portrait 1:3 (≈ 0.333 ratio)
    // Video is wider → crop should be constrained by height
    const video = makeVideoElement(1920, 1080);
    const slot = makeSlot(1 / 3);

    await captureFrame(video, slot);

    // cropH = 1080, cropW = round(1080 * (1/3)) = 360
    expect(capturedWidth).toBe(360);
    expect(capturedHeight).toBe(1080);

    vi.restoreAllMocks();
  });

  it('crops height-limited when video is taller than the slot aspect ratio', async () => {
    const mockBlob = new Blob(['x'], { type: 'image/png' });
    let capturedWidth = 0;
    let capturedHeight = 0;

    const mockCtx = { drawImage: vi.fn() };
    const mockCanvas = {
      get width() { return capturedWidth; },
      set width(v: number) { capturedWidth = v; },
      get height() { return capturedHeight; },
      set height(v: number) { capturedHeight = v; },
      getContext: vi.fn(() => mockCtx),
      toBlob: vi.fn((cb: (b: Blob | null) => void) => cb(mockBlob)),
    };

    vi.spyOn(document, 'createElement').mockImplementation((tag) => {
      if (tag === 'canvas') return mockCanvas as unknown as HTMLCanvasElement;
      return _originalCreateElement(tag);
    });

    // Video: 480×640 (portrait, ratio 0.75)
    // Slot: landscape 4:3 (ratio ≈ 1.33)
    // Slot is wider → crop constrained by width
    const video = makeVideoElement(480, 640);
    const slot = makeSlot(4 / 3);

    await captureFrame(video, slot);

    // cropW = 480, cropH = round(480 / (4/3)) = round(360) = 360
    expect(capturedWidth).toBe(480);
    expect(capturedHeight).toBe(360);

    vi.restoreAllMocks();
  });
});

// ── startCamera ───────────────────────────────────────────────────────────────

describe('startCamera', () => {
  const mockStream = {
    getTracks: vi.fn(() => []),
  } as unknown as MediaStream;

  beforeEach(() => {
    Object.defineProperty(navigator, 'mediaDevices', {
      value: { getUserMedia: vi.fn().mockResolvedValue(mockStream) },
      configurable: true,
      writable: true,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('calls getUserMedia with front-facing video constraints by default', async () => {
    const result = await startCamera();
    expect(result).toBe(mockStream);
    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith({
      video: { facingMode: { ideal: 'user' } },
      audio: false,
    });
  });

  it('passes width/height ideal constraints when provided', async () => {
    await startCamera({ width: 1280, height: 720 });
    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith({
      video: {
        facingMode: { ideal: 'user' },
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
      audio: false,
    });
  });
});

// ── stopCamera ────────────────────────────────────────────────────────────────

describe('stopCamera', () => {
  it('stops all tracks on the stream', () => {
    const stopFn = vi.fn();
    const fakeStream = {
      getTracks: vi.fn(() => [{ stop: stopFn }, { stop: stopFn }]),
    } as unknown as MediaStream;

    stopCamera(fakeStream);

    expect(fakeStream.getTracks).toHaveBeenCalled();
    expect(stopFn).toHaveBeenCalledTimes(2);
  });
});
