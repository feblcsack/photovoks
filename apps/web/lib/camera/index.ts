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

/** JPEG keeps uploads small (PNG at camera resolution can exceed 10 MB). */
const CAPTURE_JPEG_QUALITY = 0.92;

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
    return canvas.convertToBlob({ type: 'image/jpeg', quality: CAPTURE_JPEG_QUALITY });
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
      'image/jpeg',
      CAPTURE_JPEG_QUALITY,
    );
  });
}

/**
 * Stops all tracks on the given MediaStream, releasing the camera device.
 */
export function stopCamera(stream: MediaStream): void {
  stream.getTracks().forEach((track) => track.stop());
}

// ── Device selection + error classification (v2 booth) ───────────────────────

export type CameraErrorKind = 'insecure' | 'unsupported' | 'denied' | 'notfound' | 'busy' | 'unknown';

export function classifyCameraError(err: unknown): CameraErrorKind {
  if (typeof window !== 'undefined' && !window.isSecureContext) return 'insecure';
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) return 'unsupported';
  const name = (err as { name?: string })?.name ?? '';
  if (name === 'NotAllowedError' || name === 'SecurityError' || name === 'PermissionDeniedError') return 'denied';
  if (name === 'NotFoundError' || name === 'OverconstrainedError' || name === 'DevicesNotFoundError') return 'notfound';
  if (name === 'NotReadableError' || name === 'AbortError' || name === 'TrackStartError') return 'busy';
  return 'unknown';
}

export const CAMERA_ERROR_TEXT: Record<CameraErrorKind, { title: string; body: string }> = {
  insecure: {
    title: 'Kamera butuh koneksi aman (HTTPS)',
    body: 'Browser hanya mengizinkan kamera di https:// atau localhost. Buka booth lewat domain HTTPS (mis. Vercel).',
  },
  unsupported: { title: 'Browser tidak mendukung kamera', body: 'Gunakan Safari (iPad) atau Chrome versi terbaru.' },
  denied: {
    title: 'Izin kamera ditolak',
    body: 'iPad: Pengaturan › Safari › Kamera › Izinkan. Chrome: klik ikon kamera di address bar › Izinkan, lalu muat ulang.',
  },
  notfound: { title: 'Kamera tidak ditemukan', body: 'Pastikan webcam terpasang, atau pilih kamera lain.' },
  busy: { title: 'Kamera sedang dipakai aplikasi lain', body: 'Tutup aplikasi/tab lain yang memakai kamera (Zoom, Meet, dll), lalu coba lagi.' },
  unknown: { title: 'Kamera gagal dibuka', body: 'Coba muat ulang halaman atau pilih kamera lain.' },
};

/** Opens a camera at up to 1080p. `deviceId` wins over facingMode when given. */
export async function openCamera(opts: { deviceId?: string | null; facingMode?: 'user' | 'environment' } = {}): Promise<MediaStream> {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
    throw Object.assign(new Error('unsupported'), { name: 'NotSupportedError' });
  }
  const base: MediaTrackConstraints = { width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30 } };
  const video: MediaTrackConstraints = opts.deviceId
    ? { ...base, deviceId: { exact: opts.deviceId } }
    : { ...base, facingMode: { ideal: opts.facingMode ?? 'user' } };
  try {
    return await navigator.mediaDevices.getUserMedia({ video, audio: false });
  } catch (err) {
    // A stale deviceId (camera unplugged) → fall back to any camera.
    if (opts.deviceId && (err as { name?: string })?.name === 'OverconstrainedError') {
      return navigator.mediaDevices.getUserMedia({ video: base, audio: false });
    }
    throw err;
  }
}

export async function listCameras(): Promise<MediaDeviceInfo[]> {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.enumerateDevices) return [];
  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices.filter((d) => d.kind === 'videoinput');
}
