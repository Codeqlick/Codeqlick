/*
 * The cost calculator's options and arithmetic, shared by the public page (in the browser) and the
 * admin panel. No Zod here: it would ship to the browser (see contact-options.ts).
 */

export const CALCULATOR_TYPES = ['web', 'custom', 'mobile', 'design', 'support'] as const;
export const CALCULATOR_SIZES = ['small', 'medium', 'large'] as const;
export const CALCULATOR_EXTRAS = [
  'languages',
  'accounts',
  'payments',
  'admin',
  'integrations',
] as const;

export type CalculatorType = (typeof CALCULATOR_TYPES)[number];
export type CalculatorSize = (typeof CALCULATOR_SIZES)[number];
export type CalculatorExtra = (typeof CALCULATOR_EXTRAS)[number];

/** Prices in euros for a medium size, with weeks of work; sizes scale them, extras add to them. */
export type CalculatorConfig = {
  enabled: boolean;
  types: Record<CalculatorType, { min: number; max: number; weeksMin: number; weeksMax: number }>;
  sizes: Record<CalculatorSize, number>;
  extras: Record<CalculatorExtra, { min: number; max: number }>;
};

export type CalculatorChoice = {
  type: CalculatorType;
  size: CalculatorSize;
  extras: CalculatorExtra[];
};

export type Estimate = { min: number; max: number; weeksMin: number; weeksMax: number };

/** Types the team has priced (the others aren't offered). */
export function pricedTypes(config: CalculatorConfig): CalculatorType[] {
  return CALCULATOR_TYPES.filter((type) => config.types[type].max > 0);
}

/**
 * A range for a choice: the type scaled by the size, plus the extras. Prices are rounded out to
 * hundreds (down for the minimum, up for the maximum), weeks to whole weeks (at least one).
 */
export function estimate(config: CalculatorConfig, choice: CalculatorChoice): Estimate {
  const base = config.types[choice.type];
  const factor = config.sizes[choice.size];
  const extras = choice.extras.reduce(
    (sum, key) => ({
      min: sum.min + config.extras[key].min,
      max: sum.max + config.extras[key].max,
    }),
    { min: 0, max: 0 },
  );
  const weeksMin = Math.max(1, Math.round(base.weeksMin * factor));
  return {
    min: Math.floor((base.min * factor + extras.min) / 100) * 100,
    max: Math.ceil((base.max * factor + extras.max) / 100) * 100,
    weeksMin,
    weeksMax: Math.max(weeksMin, Math.ceil(base.weeksMax * factor)),
  };
}
