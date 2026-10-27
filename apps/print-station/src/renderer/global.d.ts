// =============================================================================
// global.d.ts — TypeScript declarations for window.electronAPI
// Keeps renderer code type-safe without importing from main/preload directly.
// =============================================================================

interface LocalJobRow {
  id: string;
  session_id: string;
  type: 'strip' | 'sketch';
  status: 'queued' | 'printing' | 'printed' | 'failed';
  asset_path: string | null;
  error_reason: string | null;
  created_at: number;
  updated_at: number;
}

interface JobUpdatePayload {
  jobs: LocalJobRow[];
  printerStatus: 'online' | 'offline' | 'error' | 'unknown';
  stationOnline: boolean;
}

interface PrintStationConfig {
  printerName: string;
  supabaseUrl: string;
  supabaseKey: string;
}

interface ElectronAPI {
  onJobUpdate(callback: (data: JobUpdatePayload) => void): () => void;
  requestReprint(jobId: string): Promise<void>;
  saveConfig(config: PrintStationConfig): Promise<void>;
  getJobs(): Promise<LocalJobRow[]>;
  getConfig(): Promise<PrintStationConfig>;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

export {};
