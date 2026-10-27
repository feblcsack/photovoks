// =============================================================================
// Preload — exposes safe IPC bridges to the renderer via contextBridge
// Runs in an isolated context; no Node globals leak into the renderer.
// =============================================================================

import { contextBridge, ipcRenderer } from 'electron';

/** Shape of the payload emitted with 'job-update' IPC events. */
export interface JobUpdatePayload {
  jobs: {
    id: string;
    session_id: string;
    type: 'strip' | 'sketch';
    status: 'queued' | 'printing' | 'printed' | 'failed';
    asset_path: string | null;
    error_reason: string | null;
    created_at: number;
    updated_at: number;
  }[];
  printerStatus: 'online' | 'offline' | 'error' | 'unknown';
  stationOnline: boolean;
}

contextBridge.exposeInMainWorld('electronAPI', {
  /**
   * Subscribes to 'job-update' events from the main process.
   * Returns a cleanup function that removes the listener.
   */
  onJobUpdate: (callback: (data: JobUpdatePayload) => void): (() => void) => {
    const handler = (_event: unknown, data: JobUpdatePayload) => callback(data);
    ipcRenderer.on('job-update', handler);
    return () => ipcRenderer.removeListener('job-update', handler);
  },

  /** Requests that the main process reprints the job with the given id. */
  requestReprint: (jobId: string): Promise<void> =>
    ipcRenderer.invoke('request-reprint', jobId),

  /** Saves printer/connection configuration. */
  saveConfig: (config: {
    printerName: string;
    supabaseUrl: string;
    supabaseKey: string;
  }): Promise<void> => ipcRenderer.invoke('save-config', config),

  /** Returns the stored recent job list. */
  getJobs: (): Promise<JobUpdatePayload['jobs']> =>
    ipcRenderer.invoke('get-jobs'),

  /** Returns the current saved configuration. */
  getConfig: (): Promise<{
    printerName: string;
    supabaseUrl: string;
    supabaseKey: string;
  }> => ipcRenderer.invoke('get-config'),
});
