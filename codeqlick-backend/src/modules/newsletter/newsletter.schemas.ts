import { z } from 'zod';
import { localeSchema, paginationSchema } from '../../common/schemas/common.schemas.js';

export const newsletterStatusSchema = z.enum(['PENDING', 'ACTIVE', 'UNSUBSCRIBED']);

export const subscribeSchema = z
  .object({
    email: z.email().max(254),
    locale: localeSchema,
    acceptPrivacy: z.literal(true),
    /** Honeypot: humans never see this field, bots fill it in. */
    website: z.string().max(500).optional(),
  })
  .strict();
export type SubscribeInput = z.infer<typeof subscribeSchema>;

/** A confirmation or unsubscribe token; an unknown one is answered by the service, not here. */
const tokenSchema = z.string().trim().min(1).max(200);

export const confirmSchema = z.object({ token: tokenSchema }).strict();
export type ConfirmInput = z.infer<typeof confirmSchema>;

export const unsubscribeSchema = z.object({ token: tokenSchema }).strict();
export type UnsubscribeInput = z.infer<typeof unsubscribeSchema>;

export const unsubscribeParamSchema = z.object({ token: tokenSchema });
export type UnsubscribeParam = z.infer<typeof unsubscribeParamSchema>;

export const listSubscribersQuerySchema = paginationSchema.extend({
  status: newsletterStatusSchema.optional(),
  /** Part of the email. */
  q: z
    .string()
    .trim()
    .max(200)
    .transform((value) => value || undefined)
    .optional(),
});
export type ListSubscribersQuery = z.infer<typeof listSubscribersQuerySchema>;
