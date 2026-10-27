import React, { useEffect, useState } from 'react';

// ── Types (mirrored from global.d.ts for local use) ──────────────────────────

type PrinterStatus = 'online' | 'offline' | 'error' | 'unknown';

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

type AppView = 'dashboard' | 'config';

// ── Colour helpers ────────────────────────────────────────────────────────────

function printerStatusColor(status: PrinterStatus): string {
  switch (status) {
    case 'online':  return '#22c55e'; // green-500
    case 'offline': return '#ef4444'; // red-500
    case 'error':   return '#f97316'; // orange-500
    default:        return '#9ca3af'; // grey-400
  }
}

function jobStatusColor(status: LocalJobRow['status']): string {
  switch (status) {
    case 'queued':   return '#3b82f6'; // blue-500
    case 'printing': return '#f59e0b'; // amber-500
    case 'printed':  return '#22c55e'; // green-500
    case 'failed':   return '#ef4444'; // red-500
  }
}

function truncate(str: string, maxLen = 12): string {
  return str.length > maxLen ? `${str.slice(0, maxLen)}…` : str;
}

// ── Dashboard view ────────────────────────────────────────────────────────────

interface DashboardProps {
  jobs: LocalJobRow[];
  printerStatus: PrinterStatus;
  stationOnline: boolean;
  onReprint: (jobId: string) => void;
  onConfigOpen: () => void;
}

function Dashboard({
  jobs,
  printerStatus,
  stationOnline,
  onReprint,
  onConfigOpen,
}: DashboardProps): React.ReactElement {
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);

  return (
    <div style={styles.page}>
      {/* Header */}
      <div style={styles.header}>
        <h1 style={styles.title}>Photovoks Print Station</h1>
        <button style={styles.btnSecondary} onClick={onConfigOpen}>
          Config
        </button>
      </div>

      {/* Status row */}
      <div style={styles.statusRow}>
        {/* Printer status badge */}
        <div style={styles.badge}>
          <span
            style={{ ...styles.dot, backgroundColor: printerStatusColor(printerStatus) }}
          />
          <span>Printer: <strong>{printerStatus}</strong></span>
        </div>

        {/* Station online badge */}
        <div style={styles.badge}>
          <span
            style={{
              ...styles.dot,
              backgroundColor: stationOnline ? '#22c55e' : '#ef4444',
            }}
          />
          <span>Station: <strong>{stationOnline ? 'Connected' : 'Disconnected'}</strong></span>
        </div>
      </div>

      {/* Job list */}
      <h2 style={styles.sectionTitle}>Recent Jobs</h2>
      {jobs.length === 0 ? (
        <p style={styles.empty}>No jobs yet.</p>
      ) : (
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>Job ID</th>
              <th style={styles.th}>Session</th>
              <th style={styles.th}>Type</th>
              <th style={styles.th}>Status</th>
              <th style={styles.th}>Created</th>
            </tr>
          </thead>
          <tbody>
            {jobs.map((job) => (
              <tr
                key={job.id}
                style={{
                  ...styles.tr,
                  backgroundColor: selectedJobId === job.id ? '#e0f2fe' : undefined,
                  cursor: 'pointer',
                }}
                onClick={() => setSelectedJobId(job.id === selectedJobId ? null : job.id)}
              >
                <td style={styles.td} title={job.id}>{truncate(job.id)}</td>
                <td style={styles.td} title={job.session_id}>{truncate(job.session_id)}</td>
                <td style={styles.td}>{job.type}</td>
                <td style={{ ...styles.td, color: jobStatusColor(job.status), fontWeight: 600 }}>
                  {job.status}
                </td>
                <td style={styles.td}>
                  {new Date(job.created_at).toLocaleTimeString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* Reprint button */}
      <div style={{ marginTop: 16 }}>
        <button
          style={{
            ...styles.btnPrimary,
            opacity: selectedJobId ? 1 : 0.4,
            cursor: selectedJobId ? 'pointer' : 'not-allowed',
          }}
          disabled={!selectedJobId}
          onClick={() => selectedJobId && onReprint(selectedJobId)}
        >
          Manual Reprint
        </button>
        {selectedJobId && (
          <span style={{ marginLeft: 12, color: '#6b7280', fontSize: 13 }}>
            Selected: {truncate(selectedJobId, 16)}
          </span>
        )}
      </div>
    </div>
  );
}

// ── Config view ───────────────────────────────────────────────────────────────

interface ConfigProps {
  onBack: () => void;
}

function ConfigView({ onBack }: ConfigProps): React.ReactElement {
  const [printerName, setPrinterName] = useState('');
  const [supabaseUrl, setSupabaseUrl] = useState('');
  const [supabaseKey, setSupabaseKey] = useState('');
  const [saved, setSaved] = useState(false);

  // Load existing config on mount
  useEffect(() => {
    window.electronAPI.getConfig().then((cfg) => {
      setPrinterName(cfg.printerName ?? '');
      setSupabaseUrl(cfg.supabaseUrl ?? '');
      setSupabaseKey(cfg.supabaseKey ?? '');
    }).catch(() => {/* no-op if not configured yet */});
  }, []);

  async function handleSave(): Promise<void> {
    await window.electronAPI.saveConfig({ printerName, supabaseUrl, supabaseKey });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <h1 style={styles.title}>Configuration</h1>
        <button style={styles.btnSecondary} onClick={onBack}>← Back</button>
      </div>

      <div style={styles.formGroup}>
        <label style={styles.label}>Printer Name</label>
        <input
          style={styles.input}
          type="text"
          value={printerName}
          onChange={(e) => setPrinterName(e.target.value)}
          placeholder="e.g. Canon_Selphy_CP1500"
        />
      </div>

      <div style={styles.formGroup}>
        <label style={styles.label}>Supabase URL</label>
        <input
          style={styles.input}
          type="text"
          value={supabaseUrl}
          onChange={(e) => setSupabaseUrl(e.target.value)}
          placeholder="https://your-project.supabase.co"
        />
      </div>

      <div style={styles.formGroup}>
        <label style={styles.label}>Supabase Anon Key</label>
        <input
          style={styles.input}
          type="password"
          value={supabaseKey}
          onChange={(e) => setSupabaseKey(e.target.value)}
          placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9…"
        />
      </div>

      <div style={{ marginTop: 24 }}>
        <button style={styles.btnPrimary} onClick={handleSave}>
          {saved ? '✓ Saved' : 'Save'}
        </button>
      </div>
    </div>
  );
}

// ── Root App component ────────────────────────────────────────────────────────

export default function App(): React.ReactElement {
  const [currentView, setCurrentView] = useState<AppView>('dashboard');
  const [jobs, setJobs] = useState<LocalJobRow[]>([]);
  const [printerStatus, setPrinterStatus] = useState<PrinterStatus>('unknown');
  const [stationOnline, setStationOnline] = useState(false);

  // Load initial jobs and subscribe to live updates
  useEffect(() => {
    // Fetch initial job list
    window.electronAPI.getJobs().then((initialJobs) => {
      setJobs(initialJobs);
    }).catch(() => {/* first launch, no jobs yet */});

    // Subscribe to live updates from main process
    const unsubscribe = window.electronAPI.onJobUpdate((data) => {
      setJobs(data.jobs);
      setPrinterStatus(data.printerStatus);
      setStationOnline(data.stationOnline);
    });

    return () => {
      unsubscribe();
    };
  }, []);

  async function handleReprint(jobId: string): Promise<void> {
    await window.electronAPI.requestReprint(jobId);
  }

  if (currentView === 'config') {
    return <ConfigView onBack={() => setCurrentView('dashboard')} />;
  }

  return (
    <Dashboard
      jobs={jobs}
      printerStatus={printerStatus}
      stationOnline={stationOnline}
      onReprint={handleReprint}
      onConfigOpen={() => setCurrentView('config')}
    />
  );
}

// ── Inline styles ─────────────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  page: {
    fontFamily: 'Inter, system-ui, sans-serif',
    padding: '24px',
    maxWidth: 900,
    margin: '0 auto',
    color: '#111827',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  title: {
    fontSize: 22,
    fontWeight: 700,
    margin: 0,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 600,
    marginTop: 24,
    marginBottom: 10,
  },
  statusRow: {
    display: 'flex',
    gap: 16,
    marginBottom: 8,
  },
  badge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    padding: '6px 12px',
    borderRadius: 6,
    backgroundColor: '#f3f4f6',
    fontSize: 14,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: '50%',
    flexShrink: 0,
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: 13,
  },
  th: {
    textAlign: 'left',
    padding: '8px 10px',
    borderBottom: '2px solid #e5e7eb',
    fontWeight: 600,
    color: '#6b7280',
    textTransform: 'uppercase',
    fontSize: 11,
    letterSpacing: '0.05em',
  },
  td: {
    padding: '8px 10px',
    borderBottom: '1px solid #f3f4f6',
  },
  tr: {
    transition: 'background 0.1s',
  },
  empty: {
    color: '#9ca3af',
    fontStyle: 'italic',
    marginTop: 8,
  },
  btnPrimary: {
    backgroundColor: '#E85D26',
    color: '#fff',
    border: 'none',
    borderRadius: 6,
    padding: '8px 18px',
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
  },
  btnSecondary: {
    backgroundColor: '#f3f4f6',
    color: '#374151',
    border: '1px solid #d1d5db',
    borderRadius: 6,
    padding: '8px 14px',
    fontSize: 14,
    cursor: 'pointer',
  },
  formGroup: {
    marginBottom: 18,
  },
  label: {
    display: 'block',
    fontSize: 13,
    fontWeight: 600,
    color: '#374151',
    marginBottom: 6,
  },
  input: {
    width: '100%',
    padding: '8px 10px',
    border: '1px solid #d1d5db',
    borderRadius: 6,
    fontSize: 14,
    boxSizing: 'border-box' as const,
    outline: 'none',
  },
};
