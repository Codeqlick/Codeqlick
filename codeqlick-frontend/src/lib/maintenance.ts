/**
 * The managed sites' maintenance plan (architecture 8.2, decision 110): its shapes and what the
 * portal card and Admin show of it. Pure, tested on its own.
 */

export type MaintenanceStatus = 'NONE' | 'PENDING' | 'ACTIVE' | 'PAST_DUE' | 'CANCELED';

export type MaintenancePrice = {
  amountCents: number;
  currency: string;
  interval: string | null;
  vatPercent: number;
};

export type MaintenanceOffer = {
  available: boolean;
  price: MaintenancePrice | null;
  allowance: number;
};

export type MaintenanceInvoice = {
  id: string;
  number: string | null;
  createdAt: string;
  /** VAT included. */
  totalCents: number;
  currency: string;
  status: string | null;
  /** Stripe's hosted invoice page (with its PDF). */
  url: string | null;
};

export type MaintenanceView = {
  available: boolean;
  price: MaintenancePrice | null;
  status: MaintenanceStatus;
  included: boolean;
  includedReason: string | null;
  on: boolean;
  since: string | null;
  periodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  canManage: boolean;
  allowance: { limit: number; used: number; month: string };
  invoices: MaintenanceInvoice[];
};

export type AdminMaintenanceView = MaintenanceView & {
  admin: {
    customerId: string | null;
    subscriptionId: string | null;
    subscriptionStatus: string | null;
    includedAt: string | null;
  };
};

export type MaintenanceListItem = {
  projectId: string;
  projectName: string;
  client: { id: string; name: string };
  status: MaintenanceStatus;
  included: boolean;
  includedReason: string | null;
  since: string | null;
  periodEnd: string | null;
  cancelAtPeriodEnd: boolean;
};

export type MaintenanceList = {
  items: MaintenanceListItem[];
  paidCount: number;
  includedCount: number;
  mrrCents: number | null;
};

/** What the plan includes, in order: the keys of `Maintenance.features`. */
export const MAINTENANCE_FEATURES = [
  'hosting',
  'domain',
  'updates',
  'report',
  'changes',
  'priority',
] as const;

/** The state the card shows, one sentence each. */
export type MaintenanceState =
  'none' | 'pending' | 'active' | 'ending' | 'pastDue' | 'ended' | 'included';

export function maintenanceState(
  view: Pick<MaintenanceView, 'status' | 'included' | 'cancelAtPeriodEnd'>,
): MaintenanceState {
  if (view.included) return 'included';
  switch (view.status) {
    case 'ACTIVE':
      return view.cancelAtPeriodEnd ? 'ending' : 'active';
    case 'PAST_DUE':
      return 'pastDue';
    case 'PENDING':
      return 'pending';
    case 'CANCELED':
      return 'ended';
    default:
      return 'none';
  }
}

/** Badge tones by state. */
export const MAINTENANCE_TONES = {
  none: 'neutral',
  pending: 'warning',
  active: 'success',
  ending: 'warning',
  pastDue: 'danger',
  ended: 'neutral',
  included: 'success',
} as const satisfies Record<MaintenanceState, string>;

/** The card is shown while the plan can be bought, or when the project has (or had) it. */
export function showMaintenanceCard(
  view: Pick<MaintenanceView, 'available' | 'status' | 'included'> | null,
): boolean {
  if (!view) return false;
  return view.available || view.included || view.status !== 'NONE';
}

/** Which button the card offers: take the plan, manage it in Stripe, or none. */
export function maintenanceAction(
  view: Pick<MaintenanceView, 'available' | 'on' | 'included' | 'canManage'>,
): 'checkout' | 'portal' | null {
  if (view.included) return null;
  if (view.on) return view.canManage ? 'portal' : null;
  return view.available ? 'checkout' : null;
}

/** The price with VAT, in cents, rounded as Stripe does (per line). */
export function withVat(cents: number, vatPercent: number): number {
  return Math.round((cents * (100 + vatPercent)) / 100);
}

/** Change requests still included this month (never below zero). */
export function changesLeft(allowance: { limit: number; used: number }): number {
  return Math.max(0, allowance.limit - allowance.used);
}

/** Stripe's invoice statuses the card names; anything else shows as a dash. */
const INVOICE_STATUSES = ['paid', 'open', 'void', 'uncollectible', 'draft'] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

export function invoiceStatus(status: string | null): InvoiceStatus | null {
  return INVOICE_STATUSES.find((known) => known === status) ?? null;
}
