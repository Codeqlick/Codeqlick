import { z } from 'zod';
import { localeSchema, paginationSchema } from '../../common/schemas/common.schemas.js';

export const roleSchema = z.enum(['ADMIN', 'CLIENT']);

const passwordSchema = z.string().min(12).max(256);

export const createUserSchema = z
  .object({
    email: z.email().max(254),
    name: z.string().trim().min(1).max(120),
    /** Without one, the user is emailed a link to choose it (in `locale`). */
    password: passwordSchema.optional(),
    role: roleSchema,
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
  })
  .strict();
export type UpdateUserInput = z.infer<typeof updateUserSchema>;

export const invitationSchema = z.object({ locale: localeSchema }).strict();
export type InvitationInput = z.infer<typeof invitationSchema>;

export const listUsersQuerySchema = paginationSchema.extend({
  role: roleSchema.optional(),
});
export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>;
