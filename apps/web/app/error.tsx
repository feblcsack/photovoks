'use client';

/**
 * App-wide error boundary: a retro "program not responding" dialog with a
 * retry instead of a blank page. Typical causes: database or storage
 * temporarily unreachable (quota, outage) or a flaky connection.
 */
import { useEffect } from 'react';
import { MaintenanceScreen } from '@/components/os/MaintenanceScreen';

export default function AppError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <MaintenanceScreen
      title="Waduh, Error!"
      message="Ada yang tersandung saat memuat halaman ini — biasanya koneksi atau server sedang sibuk. Data kamu aman."
      autoRetrySeconds={30}
      onRetry={retry}
    />
  );
}
