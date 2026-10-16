import { z } from 'zod';

export const domainSettingsSchema = z
  .object({
    /** The registrable domain (`peluqueriamarta.es`); null stops watching it. */
    name: z
      .string()
      .trim()
      .toLowerCase()
      .regex(
        /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/,
        'A domain like peluqueria.es',
      )
      .nullable(),
    source: z.enum(['RDAP', 'MANUAL']),
    /** `yyyy-mm-dd`, typed by the team when the source is MANUAL. */
    expiresAt: z.iso.date().nullable().optional(),
  })
  .strict();
export type DomainSettingsInput = z.infer<typeof domainSettingsSchema>;
