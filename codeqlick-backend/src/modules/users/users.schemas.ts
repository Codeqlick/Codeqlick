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
    /** A person of a client company: the company's main client account. Clients only. */
    memberOfId: z.uuid().optional(),
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
    weeklyDigest: z.boolean().optional(),
    monthlyReport: z.boolean().optional(),
  })
  .strict();
export type UpdateUserInput = z.infer<typeof updateUserSchema>;

/** Without `locale`, the email goes out in the user's language. */
export const invitationSchema = z.object({ locale: localeSchema.optional() }).strict();
export type InvitationInput = z.infer<typeof invitationSchema>;

export const listUsersQuerySchema = paginationSchema.extend({
  role: roleSchema.optional(),
  /** The people of a client company (members of that account). */
  memberOf: z.uuid().optional(),
  /** `true`: client accounts only, without their members (e.g. to pick a project's client). */
  accounts: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => value === 'true'),
});
export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>;
