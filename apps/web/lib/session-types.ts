/** Client-safe session shapes returned by the API. */

export type AiStatus = 'pending' | 'processing' | 'done' | 'failed' | 'failed_safety';

export interface AiGenerationView {
  id: string;
  styleId: string;
  shotIndex: number;
  status: AiStatus;
  url: string | null;
  error: string | null;
  createdAt: string;
}

export interface PrintJobView {
  id: string;
  type: 'strip' | 'sketch' | 'ai';
  status: 'queued' | 'printing' | 'printed' | 'failed' | 'cancelled' | 'cancel_failed';
  copies: number;
  source: string;
  errorReason: string | null;
  createdAt: string;
}

export interface SessionSummary {
  id: string;
  /** Only included for event managers (lets them open the guest page). */
  token?: string;
  eventId: string;
  createdAt: string;
  status: string;
  frameName: string | null;
  shotCount: number;
  liveFrames: number;
  isHidden: boolean;
  printCount: number;
  stripWidth: number | null;
  stripHeight: number | null;
  urls: {
    strip: string | null;
    thumb: string | null;
    gif: string | null;
    live: string | null;
    sheet: string | null;
    shots: string[];
  };
  ai: AiGenerationView[];
  printJobs: PrintJobView[];
}

export interface GuestEventInfo {
  name: string;
  code: string;
  aiEnabled: boolean;
  aiStyles: string[];
  aiPerSession: number;
  printMode: 'off' | 'browser' | 'station';
  printPaper: string;
  maxGuestPrints: number;
  hasCustomStyle: boolean;
}

export interface GuestSessionData {
  session: SessionSummary;
  event: GuestEventInfo;
  aiConfigured: boolean;
  printStationOnline: boolean;
  expiresAt: string | null;
}
