// =============================================================================
// Print Station — Electron main process entry point
// =============================================================================

import { app, BrowserWindow, ipcMain } from 'electron';
import log from 'electron-log';
import path from 'path';
import Store from 'electron-store';
import { initLocalQueue, getRecentJobs } from './local-queue';
import {
  startJobProcessor,
  stopJobProcessor,
  restartJobProcessor,
  setBroadcastFn,
  requeueJob,
} from './job-processor';

log.initialize();
log.info('Print Station starting…');

// ── Config store (persisted via electron-store) ───────────────────────────────

interface StationConfig {
  printerName: string;
  supabaseUrl: string;
  supabaseKey: string;
}

const store = new Store<StationConfig>({
  defaults: {
    printerName: '',
    supabaseUrl: '',
    supabaseKey: '',
  },
});

// ── Window management ─────────────────────────────────────────────────────────

let mainWindow: BrowserWindow | null = null;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1024,
    height: 768,
    title: 'Photovoks Print Station',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ── App lifecycle ─────────────────────────────────────────────────────────────

app.whenReady().then(() => {
  // Initialise the local SQLite queue before any jobs arrive
  try {
    initLocalQueue();
    log.info('Local job queue initialised.');
  } catch (err) {
    log.error('Failed to initialise local job queue:', err);
  }

  createWindow();

  // Wire broadcast function so job-processor can send IPC events to renderer
  setBroadcastFn(broadcastJobUpdate);

  // Start the job processor (Realtime subscription + heartbeat + polling)
  startJobProcessor().catch((err) => {
    log.error('Failed to start job processor:', err);
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    stopJobProcessor().finally(() => app.quit());
  }
});

// ── IPC handlers ──────────────────────────────────────────────────────────────

/** Returns the most recent 20 jobs from local SQLite (wired to renderer getJobs). */
ipcMain.handle('get-jobs', async () => {
  try {
    return getRecentJobs(20);
  } catch (err) {
    log.error('get-jobs handler error:', err);
    return [];
  }
});

/** Returns the stored configuration. */
ipcMain.handle('get-config', async () => {
  return {
    printerName: store.get('printerName'),
    supabaseUrl: store.get('supabaseUrl'),
    supabaseKey: store.get('supabaseKey'),
  };
});

/** Saves configuration fields to the persistent store and restarts the job processor. */
ipcMain.handle(
  'save-config',
  async (
    _event,
    config: { printerName: string; supabaseUrl: string; supabaseKey: string },
  ) => {
    store.set('printerName', config.printerName);
    store.set('supabaseUrl', config.supabaseUrl);
    store.set('supabaseKey', config.supabaseKey);
    log.info('Config saved:', { printerName: config.printerName, supabaseUrl: config.supabaseUrl });

    // Reconnect Supabase with the new credentials
    restartJobProcessor().catch((err) => {
      log.error('Failed to restart job processor after config save:', err);
    });
  },
);

/**
 * Manual reprint handler — re-queues the job in Supabase so the job processor
 * picks it up on the next poll or Realtime event.
 */
ipcMain.handle('request-reprint', async (_event, jobId: string) => {
  log.info('Manual reprint requested for job:', jobId);
  const success = await requeueJob(jobId);
  log.info('Reprint requeue result:', { jobId, success });
  broadcastJobUpdate({
    jobs: getRecentJobs(20),
    printerStatus: 'unknown',
    stationOnline: false,
  });
});

// ── Helper: push job updates to the renderer ──────────────────────────────────

/**
 * Broadcasts a 'job-update' event to the renderer window.
 * Called by job-processor.ts (wired in a future task) whenever job state changes.
 */
export function broadcastJobUpdate(payload: {
  jobs: ReturnType<typeof getRecentJobs>;
  printerStatus: 'online' | 'offline' | 'error' | 'unknown';
  stationOnline: boolean;
}): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('job-update', payload);
  }
}
