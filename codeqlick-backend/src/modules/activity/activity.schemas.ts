import { z } from 'zod';
import { paginationSchema } from '../../common/schemas/common.schemas.js';

/** What a log entry can be about. */
export const ACTIVITY_TARGETS = [
  'post',
  'portfolio',
  'project',
  'user',
  'lead',
  'media',
  'account',
] as const;
export type ActivityTarget = (typeof ACTIVITY_TARGETS)[number];

/** Every action that is recorded, as `<target>.<verb>`. */
export const ACTIVITY_ACTIONS = [
  'post.created',
  'post.updated',
  'post.published',
  'post.unpublished',
  'post.scheduled',
  'post.deleted',
  'portfolio.created',
  'portfolio.updated',
  'portfolio.published',
  'portfolio.unpublished',
  'portfolio.scheduled',
  'portfolio.deleted',
  'project.created',
  'project.updated',
  'project.deleted',
  'project.update_posted',
  'project.file_uploaded',
  'project.file_deleted',
  'user.created',
  'user.updated',
  'lead.updated',
  'media.uploaded',
  'media.deleted',
  'account.password_changed',
  'account.two_factor_enabled',
  'account.two_factor_disabled',
  'account.sessions_revoked',
] as const;
export type ActivityAction = (typeof ACTIVITY_ACTIONS)[number];

export const listActivityQuerySchema = paginationSchema.extend({
  targetType: z.enum(ACTIVITY_TARGETS).optional(),
});
export type ListActivityQuery = z.infer<typeof listActivityQuerySchema>;
