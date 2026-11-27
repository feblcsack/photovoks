/** Client-safe payment shapes (booth, guest page, portals). */

export type PaymentPurpose = 'session' | 'ai';
export type PaymentMethod = 'qris' | 'cash';
export type PaymentStatus = 'pending' | 'paid' | 'approved' | 'declined' | 'expired' | 'cancelled' | 'failed';

export interface PaymentRequirement {
  /** True when the guest must pay before continuing. */
  required: boolean;
  amount: number;
  /** Methods available right now (QRIS only when Aulaa is configured). */
  methods: PaymentMethod[];
}

export interface PaymentView {
  token: string;
  purpose: PaymentPurpose;
  method: PaymentMethod;
  amount: number;
  status: PaymentStatus;
  /** 4-character code the guest shows to the cashier (cash). */
  shortCode: string;
  /** Aulaa hosted QRIS page. */
  paymentLink: string | null;
  expiresAt: string | null;
  paidAt: string | null;
  consumed: boolean;
  /** Paid/approved and not used yet. */
  usable: boolean;
}

/** Row shown to operators in the payments list. */
export interface PaymentAdminView extends PaymentView {
  id: string;
  eventId: string;
  eventName?: string;
  eventCode?: string;
  orderId: string;
  decidedBy: string | null;
  createdAt: string;
  sessionId: string | null;
}

export const PAID_STATUSES: readonly PaymentStatus[] = ['paid', 'approved'];
export const FINAL_FAILED: readonly PaymentStatus[] = ['declined', 'expired', 'cancelled', 'failed'];

export const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  pending: 'Menunggu',
  paid: 'Lunas (QRIS)',
  approved: 'Disetujui',
  declined: 'Ditolak',
  expired: 'Kedaluwarsa',
  cancelled: 'Dibatalkan',
  failed: 'Gagal',
};
