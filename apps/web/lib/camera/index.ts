/**
 * Camera module for the Photovoks booth.
 *
 * Provides three public functions:
 *  - startCamera(constraints?)  — requests a MediaStream from the front-facing camera
 *  - captureFrame(video, slot)  — captures the current video frame, cropped to the
 *                                  slot's aspect ratio, and returns a PNG Blob
 *  - stopCamera(stream)         — stops all tracks on a MediaStream
 *
 * Requirements: 4.1, 4.2, 4.3
 */

import type { SlotGeometry } from '@photovoks/shared-types';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CameraConstraints {
  /** Which camera to prefer. Defaults to 'user' (front-facing). */
  facingMode?: 'user' | 'environment';
  /** Ideal video width in pixels. */
  width?: number;
  /** Ideal video height in pixels. */
  height?: number;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Requests the front-facing camera via `getUserMedia` and returns the stream.
 *
 * @throws {DOMException} If camera permission is denied or no device is found.
 */
export async function startCamera(
  constraints: CameraConstraints = {},
): Promise<MediaStream> {
  const { facingMode = 'user', width, height } = constraints;

  const videoConstraints: MediaTrackConstraints = {
    facingMode: { ideal: facingMode },
  };

  if (width !== undefined) videoConstraints.width = { ideal: width };
  if (height !== undefined) videoConstraints.height = { ideal: height };

  return navigator.mediaDevices.getUserMedia({ video: videoConstraints, audio: false });
}

/**
 * Captures the current video frame, cropped to match the slot's aspect ratio
 * and horizontal span, returning a PNG Blob.
 *
 * Crop logic:
 *  - The slot's aspect ratio (w/h) determines the output shape.
 *  - We find the largest centred rectangle inside the video that matches this
 *    ratio, ensuring the captured photo fills the slot without distortion.
 *  - Falls back to slot.w / slot.h when aspectRatio is missing (legacy data).
 *
 * Falls back to a regular `<canvas>` if `OffscreenCanvas` is unavailable.
 *
 * @param video  - The `<video>` element streaming the camera feed.
 * @param slot   - The slot geometry describing position and aspect ratio.
 * @returns      PNG Blob of the cropped frame.
 */
export async function captureFrame(
  video: HTMLVideoElement,
  slot: SlotGeometry,
): Promise<Blob> {
  const vw = video.videoWidth;
  const vh = video.videoHeight;

  if (vw === 0 || vh === 0) {
    throw new Error('Video stream has zero dimensions; stream may not be playing yet.');
  }

  // Aspect ratio of the slot (w/h). Fall back to computing from w and h if
  // the field is missing (frames created before aspectRatio was added to schema).
  const slotAspect = slot.aspectRatio ?? (slot.w / slot.h);

  // Find the largest centred rectangle in the video that matches slotAspect.
  // This is a "letterbox" crop: we take the full available width or height
  // depending on which axis is the constraint.
  let cropW: number;
  let cropH: number;

  if (vw / vh > slotAspect) {
    // Video is wider than the slot ratio — constrain by height, crop width
    cropH = vh;
    cropW = Math.round(vh * slotAspect);
  } else {
    // Video is taller than the slot ratio — constrain by width, crop height
    cropW = vw;
    cropH = Math.round(vw / slotAspect);
  }

  // Centre the crop rectangle within the video frame
  const cropX = Math.round((vw - cropW) / 2);
  const cropY = Math.round((vh - cropH) / 2);

  // Output size = crop size (native resolution, maximum quality)
  const outW = cropW;
  const outH = cropH;

  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(outW, outH);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Failed to get 2D context from OffscreenCanvas.');
    ctx.drawImage(video, cropX, cropY, cropW, cropH, 0, 0, outW, outH);
    return canvas.convertToBlob({ type: 'image/png' });
  }

  // Fallback: HTMLCanvasElement
  const canvas = document.createElement('canvas');
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Failed to get 2D context from canvas.');
  ctx.drawImage(video, cropX, cropY, cropW, cropH, 0, 0, outW, outH);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error('canvas.toBlob returned null.'));
      },
      'image/png',
    );
  });
}

/**
 * Stops all tracks on the given MediaStream, releasing the camera device.
 */
export function stopCamera(stream: MediaStream): void {
  stream.getTracks().forEach((track) => track.stop());
}
