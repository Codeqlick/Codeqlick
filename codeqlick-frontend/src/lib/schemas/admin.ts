import { z } from 'zod';
import { LEAD_STATUSES, PROJECT_PHASES } from '@/lib/api/types';
import {
  optionalDate,
  optionalDateTime,
  optionalUrl,
  publishStatusSchema,
  requiredString,
  slugSchema,
} from './common';

/* Translations: English is required; Spanish is optional but must be complete when started. */

/**
 * Superrefine for a translation fieldset: when `required` every field must be filled; otherwise the
 * fieldset may be left completely empty, but once started it must be complete.
 */
function completeTranslation(required: boolean) {
  return (value: Record<string, string>, ctx: z.RefinementCtx) => {
    const entries = Object.entries(value).map(([field, v]) => [field, v.trim()] as const);
    const anyFilled = entries.some(([, v]) => v !== '');
    if (!required && !anyFilled) return;
    for (const [field, v] of entries) {
      if (v === '') {
        ctx.addIssue({
          code: 'custom',
          path: [field],
          message: required ? 'required' : 'translationIncomplete',
        });
      }
    }
  };
}

const postTranslation = (required: boolean) =>
  z
    .object({
      title: z.string().max(200, 'tooLong'),
      excerpt: z.string().max(500, 'tooLong'),
      content: z.string().max(100000, 'tooLong'),
    })
    .superRefine(completeTranslation(required));

const portfolioTranslation = (required: boolean) =>
  z
    .object({
      title: z.string().max(200, 'tooLong'),
      summary: z.string().max(500, 'tooLong'),
      content: z.string().max(100000, 'tooLong'),
    })
    .superRefine(completeTranslation(required));

export const POST_TRANSLATION_FIELDS = ['title', 'excerpt', 'content'] as const;
export const PORTFOLIO_TRANSLATION_FIELDS = ['title', 'summary', 'content'] as const;

export const postFormSchema = z.object({
  slug: slugSchema,
  status: publishStatusSchema,
  publishedAt: optionalDateTime,
  coverImageUrl: optionalUrl,
  en: postTranslation(true),
  es: postTranslation(false),
});

export const tagFormSchema = z.object({
  slug: slugSchema,
  nameEs: requiredString(40),
  nameEn: requiredString(40),
});

export const portfolioFormSchema = z.object({
  slug: slugSchema,
  status: publishStatusSchema,
  publishedAt: optionalDateTime,
  coverImageUrl: optionalUrl,
  clientName: z
    .string()
    .trim()
    .max(120, 'tooLong')
    .transform((value) => (value === '' ? null : value)),
  projectUrl: optionalUrl,
  technologies: z
    .string()
    .max(1000, 'tooLong')
    .transform((value) =>
      value
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  sortOrder: z
    .string()
    .trim()
    .transform((value) => (value === '' ? '0' : value))
    .refine((value) => /^-?\d+$/.test(value), 'number')
    .transform((value) => Number.parseInt(value, 10)),
  en: portfolioTranslation(true),
  es: portfolioTranslation(false),
});

export const leadUpdateSchema = z.object({
  status: z.enum(LEAD_STATUSES, 'choice'),
  notes: z
    .string()
    .max(5000, 'tooLong')
    .transform((value) => (value.trim() === '' ? null : value)),
});

export const projectFormSchema = z.object({
  clientId: z.string().trim().min(1, 'required'),
  name: requiredString(160),
  description: z
    .string()
    .max(5000, 'tooLong')
    .transform((value) => (value.trim() === '' ? null : value)),
  phase: z.enum(PROJECT_PHASES, 'choice'),
  progress: z
    .string()
    .trim()
    .refine((value) => /^\d{1,3}$/.test(value) && Number(value) <= 100, 'progress')
    .transform((value) => Number.parseInt(value, 10)),
  startDate: optionalDate,
  dueDate: optionalDate,
  stagingUrl: optionalUrl,
  productionUrl: optionalUrl,
});

export const projectUpdateSchema = z.object({
  title: requiredString(160),
  body: z.string().trim().min(1, 'required').max(20000, 'tooLong'),
});

export const ROLES = ['ADMIN', 'CLIENT'] as const;

export const passwordSchema = z.string().min(12, 'password').max(256, 'tooLong');

export const userCreateSchema = z.object({
  name: requiredString(120),
  email: z.string().trim().min(1, 'required').pipe(z.email('email')),
  role: z.enum(ROLES, 'choice'),
  password: passwordSchema,
});

export const userUpdateSchema = z.object({
  name: requiredString(120),
  role: z.enum(ROLES, 'choice'),
  isActive: z.boolean(),
});

export const passwordResetSchema = z.object({ password: passwordSchema });
