import { z } from 'zod';
import { MAX_NOTIFICATIONS } from './cruising-notifications.rules.js';

/** Phase 6 (decision 97): turning profile visits on or off. */
export const visitsSettingsSchema = z.object({ showVisits: z.boolean() });
export type VisitsSettingsInput = z.infer<typeof visitsSettingsSchema>;

/** Phase 6 (decision 98): the notifications to mark read; none means all. */
export const notificationsReadSchema = z.object({
  ids: z.array(z.uuid()).min(1).max(MAX_NOTIFICATIONS).optional(),
});
export type NotificationsReadInput = z.infer<typeof notificationsReadSchema>;
