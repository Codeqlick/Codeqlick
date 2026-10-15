import { z } from 'zod';
import { localeSchema, paginationSchema } from '../../common/schemas/common.schemas.js';

export const roleSchema = z.enum(['ADMIN', 'CLIENT']);

const passwordSchema = z.string().min(12).max(256);

export const createUserSchema = z
  .object({
    email: z.email().max(254),
    name: z.string().trim().min(1).max(120),
    /** Without one, the user is emailed a link to choose it. */
    password: passwordSchema.optional(),
    role: roleSchema,
    /** Language of the emails the platform sends this user. */
    locale: localeSchema.default('en'),
  })
  .strict();
export type CreateUserInput = z.infer<typeof createUserSchema>;

export const updateUserSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    password: passwordSchema.optional(),
    isActive: z.boolean().optional(),
    role: roleSchema.optional(),
    locale: localeSchema.optional(),
  })
  .strict();
export type UpdateUserInput = z.infer<typeof updateUserSchema>;

/** Without `locale`, the email goes out in the user's language. */
export const invitationSchema = z.object({ locale: localeSchema.optional() }).strict();
export type InvitationInput = z.infer<typeof invitationSchema>;

export const listUsersQuerySchema = paginationSchema.extend({
  role: roleSchema.optional(),
});
export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>;
