import { z } from 'zod';

/** The team's settings of a project's form. */
export const siteFormSchema = z
  .object({
    enabled: z.boolean(),
    /** Who receives the messages: the client's addresses. */
    recipients: z.array(z.email().max(254)).min(1).max(5),
  })
  .strict();
export type SiteFormInput = z.infer<typeof siteFormSchema>;

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((value) => (value === undefined || value === '' ? undefined : value));

/**
 * What a site's form sends (a plain HTML form, so every value is a string). Unknown fields are
 * ignored: a site may add its own.
 */
export const submissionSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.email().max(254),
  phone: optionalText(40),
  message: z.string().trim().min(1).max(5000),
  /** Honeypot: humans never see this field, bots fill it in. */
  website: z.string().max(500).optional(),
  /** Page to send the visitor back to (it must be on the site). */
  redirect: z.string().max(2000).optional(),
});
export type SubmissionInput = z.infer<typeof submissionSchema>;
