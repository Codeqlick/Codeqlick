import { describe, expect, it } from 'vitest';
import { estimate, pricedTypes, type CalculatorConfig } from './calculator';

const config: CalculatorConfig = {
  enabled: true,
  types: {
    web: { min: 2000, max: 4000, weeksMin: 3, weeksMax: 5 },
    custom: { min: 0, max: 0, weeksMin: 0, weeksMax: 0 },
    mobile: { min: 8000, max: 15000, weeksMin: 8, weeksMax: 12 },
    design: { min: 0, max: 0, weeksMin: 0, weeksMax: 0 },
    support: { min: 0, max: 0, weeksMin: 0, weeksMax: 0 },
  },
  sizes: { small: 0.6, medium: 1, large: 1.8 },
  extras: {
    languages: { min: 300, max: 600 },
    accounts: { min: 0, max: 0 },
    payments: { min: 650, max: 1250 },
    admin: { min: 0, max: 0 },
    integrations: { min: 0, max: 0 },
  },
};

describe('estimate', () => {
  it('scales the type by the size and adds the extras, rounded out to hundreds', () => {
    expect(estimate(config, { type: 'web', size: 'medium', extras: [] })).toEqual({
      min: 2000,
      max: 4000,
      weeksMin: 3,
      weeksMax: 5,
    });
    expect(
      estimate(config, { type: 'web', size: 'large', extras: ['languages', 'payments'] }),
    ).toEqual({ min: 4500, max: 9100, weeksMin: 5, weeksMax: 9 });
  });

  it('never goes below one week', () => {
    const tiny = {
      ...config,
      types: { ...config.types, web: { min: 500, max: 900, weeksMin: 1, weeksMax: 1 } },
    };
    expect(estimate(tiny, { type: 'web', size: 'small', extras: [] })).toMatchObject({
      weeksMin: 1,
      weeksMax: 1,
    });
  });

  it('only offers the types the team priced', () => {
    expect(pricedTypes(config)).toEqual(['web', 'mobile']);
  });
});
