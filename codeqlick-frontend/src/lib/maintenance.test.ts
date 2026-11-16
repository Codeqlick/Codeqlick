import { describe, expect, it } from 'vitest';
import {
  changesLeft,
  invoiceStatus,
  maintenanceAction,
  maintenanceState,
  showMaintenanceCard,
  withVat,
  type MaintenanceView,
} from './maintenance';

const view = (overrides: Partial<MaintenanceView> = {}): MaintenanceView => ({
  available: true,
  price: { amountCents: 1900, currency: 'eur', interval: 'month', vatPercent: 21 },
  status: 'NONE',
  included: false,
  includedReason: null,
  on: false,
  since: null,
  periodEnd: null,
  cancelAtPeriodEnd: false,
  canManage: false,
  allowance: { limit: 3, used: 0, month: '2026-11' },
  invoices: [],
  ...overrides,
});

describe('maintenance plan card', () => {
  it('names the state from the status, the cancellation and the inclusion', () => {
    expect(maintenanceState(view())).toBe('none');
    expect(maintenanceState(view({ status: 'PENDING' }))).toBe('pending');
    expect(maintenanceState(view({ status: 'ACTIVE' }))).toBe('active');
    expect(maintenanceState(view({ status: 'ACTIVE', cancelAtPeriodEnd: true }))).toBe('ending');
    expect(maintenanceState(view({ status: 'PAST_DUE' }))).toBe('pastDue');
    expect(maintenanceState(view({ status: 'CANCELED' }))).toBe('ended');
    expect(maintenanceState(view({ status: 'CANCELED', included: true }))).toBe('included');
  });

  it('is hidden while the plan is off, unless the project has or had it', () => {
    expect(showMaintenanceCard(null)).toBe(false);
    expect(showMaintenanceCard(view())).toBe(true);
    expect(showMaintenanceCard(view({ available: false }))).toBe(false);
    expect(showMaintenanceCard(view({ available: false, included: true }))).toBe(true);
    expect(showMaintenanceCard(view({ available: false, status: 'ACTIVE' }))).toBe(true);
  });

  it('offers to take the plan, to manage it, or nothing', () => {
    expect(maintenanceAction(view())).toBe('checkout');
    expect(maintenanceAction(view({ available: false }))).toBeNull();
    expect(maintenanceAction(view({ status: 'ACTIVE', on: true, canManage: true }))).toBe('portal');
    expect(maintenanceAction(view({ status: 'PAST_DUE', on: true, canManage: true }))).toBe(
      'portal',
    );
    expect(maintenanceAction(view({ status: 'PENDING', canManage: true }))).toBe('checkout');
    expect(maintenanceAction(view({ status: 'CANCELED', canManage: true }))).toBe('checkout');
    expect(maintenanceAction(view({ included: true, on: true }))).toBeNull();
  });

  it('adds VAT and counts the changes left', () => {
    expect(withVat(1900, 21)).toBe(2299);
    expect(withVat(1900, 0)).toBe(1900);
    expect(changesLeft({ limit: 3, used: 1 })).toBe(2);
    expect(changesLeft({ limit: 3, used: 5 })).toBe(0);
  });

  it("names Stripe's invoice statuses it knows", () => {
    expect(invoiceStatus('paid')).toBe('paid');
    expect(invoiceStatus('uncollectible')).toBe('uncollectible');
    expect(invoiceStatus('something-new')).toBeNull();
    expect(invoiceStatus(null)).toBeNull();
  });
});
