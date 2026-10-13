import { z } from 'zod';

/** Slugs match the API rule: ^[a-z0-9]+(?:-[a-z0-9]+)*$ */
export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const requiredString = (max = 200) =>
  z.string().trim().min(1, 'required').max(max, 'tooLong');

export const slugSchema = z
  .string()
  .trim()
  .min(1, 'required')
  .max(120, 'tooLong')
  .regex(SLUG_PATTERN, 'slug');

/** Optional http(s) URL: '' → null. */
export const optionalUrl = z
  .string()
  .trim()
  .max(2048, 'tooLong')
  .refine((value) => value === '' || /^https?:\/\/[^\s]+$/i.test(value), 'url')
  .transform((value) => (value === '' ? null : value));

/** Optional yyyy-mm-dd date: '' → null, otherwise an ISO date string. */
export const optionalDate = z
  .string()
  .trim()
  .refine((value) => value === '' || /^\d{4}-\d{2}-\d{2}$/.test(value), 'date')
  .transform((value) => (value === '' ? null : value));

export const publishStatusSchema = z.enum(['DRAFT', 'PUBLISHED'], 'choice');
