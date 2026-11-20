'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { classifyCameraError, listCameras, openCamera, type CameraErrorKind } from '@/lib/camera';

const DEVICE_KEY = 'photovoks.cameraId';

/** Keeps one camera stream alive for the whole booth (no re-prompting). */
export function useCamera() {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<CameraErrorKind | null>(null);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const streamRef = useRef<MediaStream | null>(null);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setStream(null);
  }, []);

  const start = useCallback(
    async (preferred?: string | null) => {
      setStarting(true);
      setError(null);
      try {
        const wanted = preferred ?? (typeof localStorage !== 'undefined' ? localStorage.getItem(DEVICE_KEY) : null);
        streamRef.current?.getTracks().forEach((t) => t.stop());
        const s = await openCamera({ deviceId: wanted, facingMode: 'user' });
        streamRef.current = s;
        setStream(s);
        const id = s.getVideoTracks()[0]?.getSettings().deviceId ?? null;
        setDeviceId(id);
        if (id) localStorage.setItem(DEVICE_KEY, id);
        // Labels are only available after permission is granted.
        setDevices(await listCameras());
      } catch (err) {
        setError(classifyCameraError(err));
      } finally {
        setStarting(false);
      }
    },
    [],
  );

  // Track ended (camera unplugged / iPad interrupted) → surface an error.
  useEffect(() => {
    const track = stream?.getVideoTracks()[0];
    if (!track) return;
    const onEnded = () => setError('busy');
    track.addEventListener('ended', onEnded);
    return () => track.removeEventListener('ended', onEnded);
  }, [stream]);

  useEffect(() => stop, [stop]);

  return { stream, error, devices, deviceId, starting, start, stop };
}

export type CameraController = ReturnType<typeof useCamera>;
