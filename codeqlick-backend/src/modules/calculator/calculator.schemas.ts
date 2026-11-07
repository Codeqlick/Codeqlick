import { z } from 'zod';

/** What can be estimated: the contact form's project types (without "not sure"). */
export const CALCULATOR_TYPES = ['web', 'custom', 'mobile', 'design', 'support'] as const;
export const CALCULATOR_SIZES = ['small', 'medium', 'large'] as const;
export const CALCULATOR_EXTRAS = [
  'languages',
  'accounts',
  'payments',
  'admin',
  'integrations',
] as const;

const euros = z.number().int().min(0).max(10_000_000);
const weeks = z.number().int().min(0).max(520);

const typeSchema = z
  .object({ min: euros, max: euros, weeksMin: weeks, weeksMax: weeks })
  .strict()
  .refine((type) => type.max >= type.min && type.weeksMax >= type.weeksMin, {
    message: 'The maximum must not be below the minimum',
  });

const extraSchema = z
  .object({ min: euros, max: euros })
  .strict()
  .refine((extra) => extra.max >= extra.min, {
    message: 'The maximum must not be below the minimum',
  });

const record = <K extends readonly string[], V extends z.ZodType>(keys: K, value: V) =>
  z.object(Object.fromEntries(keys.map((key) => [key, value])) as { [P in K[number]]: V }).strict();

/**
 * The calculator's prices, set by the team. Types are priced for a medium size in euros, with
 * weeks of work; sizes scale them; extras add to them. Nothing is public until `enabled`.
 */
export const calculatorConfigSchema = z
  .object({
    enabled: z.boolean(),
    types: record(CALCULATOR_TYPES, typeSchema),
    /** Factors applied to a type's price and weeks (medium is usually 1). */
    sizes: record(CALCULATOR_SIZES, z.number().min(0.1).max(10)),
    extras: record(CALCULATOR_EXTRAS, extraSchema),
  })
  .strict()
  .refine(
    (config) => !config.enabled || CALCULATOR_TYPES.some((key) => config.types[key].max > 0),
    {
      message: 'Set the prices of at least one project type before publishing it',
      path: ['enabled'],
    },
  );
export type CalculatorConfig = z.infer<typeof calculatorConfigSchema>;

/** Until the team sets it: no prices, not published. */
export const DEFAULT_CALCULATOR: CalculatorConfig = {
  enabled: false,
  types: Object.fromEntries(
    CALCULATOR_TYPES.map((key) => [key, { min: 0, max: 0, weeksMin: 0, weeksMax: 0 }]),
  ) as CalculatorConfig['types'],
  sizes: { small: 0.6, medium: 1, large: 1.8 },
  extras: Object.fromEntries(
    CALCULATOR_EXTRAS.map((key) => [key, { min: 0, max: 0 }]),
  ) as CalculatorConfig['extras'],
};
