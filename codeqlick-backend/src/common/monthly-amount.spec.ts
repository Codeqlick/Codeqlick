import { describe, expect, it } from 'vitest';
import { monthlyAmountCents } from './monthly-amount.js';

const price = (unit_amount: number | null, interval: string, interval_count = 1) => ({
  unit_amount,
  recurring: { interval, interval_count },
});

describe('monthlyAmountCents', () => {
  it('takes a monthly price as it is, times the quantity', () => {
    expect(monthlyAmountCents([{ price: price(1900, 'month') }])).toBe(1900);
    expect(monthlyAmountCents([{ quantity: 3, price: price(1900, 'month') }])).toBe(5700);
    expect(monthlyAmountCents([{ quantity: null, price: price(900, 'month') }])).toBe(900);
  });

  it('brings other intervals to a month, rounded to the cent', () => {
    expect(monthlyAmountCents([{ price: price(12_000, 'year') }])).toBe(1000);
    expect(monthlyAmountCents([{ price: price(5000, 'month', 3) }])).toBe(1667);
    expect(monthlyAmountCents([{ price: price(1000, 'week') }])).toBe(4333);
    expect(monthlyAmountCents([{ price: price(100, 'day') }])).toBe(3042);
    expect(monthlyAmountCents([{ price: price(1000, 'month', 0) }])).toBe(1000);
  });

  it('adds up every item', () => {
    expect(
      monthlyAmountCents([{ price: price(1900, 'month') }, { price: price(12_000, 'year') }]),
    ).toBe(2900);
  });

  it('is null when there is nothing reliable to add up', () => {
    expect(monthlyAmountCents([])).toBeNull();
    expect(monthlyAmountCents([{}])).toBeNull();
    expect(monthlyAmountCents([{ price: null }])).toBeNull();
    expect(monthlyAmountCents([{ price: price(null, 'month') }])).toBeNull();
    expect(monthlyAmountCents([{ price: { unit_amount: 1900, recurring: null } }])).toBeNull();
    expect(monthlyAmountCents([{ price: price(1900, 'fortnight') }])).toBeNull();
    expect(
      monthlyAmountCents([{ price: price(1900, 'month') }, { price: price(null, 'month') }]),
    ).toBeNull();
  });
});
