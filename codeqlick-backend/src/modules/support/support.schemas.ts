import { z } from 'zod';
import { paginationSchema } from '../../common/schemas/common.schemas.js';

export const ticketTypeSchema = z.enum(['BUG', 'CHANGE', 'QUESTION']);
export const ticketPrioritySchema = z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']);
export const ticketStatusSchema = z.enum([
  'OPEN',
  'IN_PROGRESS',
  'WAITING_CLIENT',
  'RESOLVED',
  'CLOSED',
]);

const body = z.string().trim().min(1).max(20_000);

export const createTicketSchema = z
  .object({
    type: ticketTypeSchema,
    priority: ticketPrioritySchema.default('NORMAL'),
    title: z.string().trim().min(1).max(200),
    body,
    /** One of the client's projects, when it is about one. */
    projectId: z.uuid().nullable().optional(),
  })
  .strict();
export type CreateTicketInput = z.infer<typeof createTicketSchema>;

export const ticketMessageSchema = z.object({ body }).strict();
export type TicketMessageInput = z.infer<typeof ticketMessageSchema>;

/** The team answers and, optionally, moves the request (default: waiting for the client). */
export const adminTicketMessageSchema = z
  .object({ body, status: ticketStatusSchema.optional() })
  .strict();
export type AdminTicketMessageInput = z.infer<typeof adminTicketMessageSchema>;

export const updateTicketSchema = z
  .object({ status: ticketStatusSchema.optional(), priority: ticketPrioritySchema.optional() })
  .strict();
export type UpdateTicketInput = z.infer<typeof updateTicketSchema>;

export const listTicketsQuerySchema = paginationSchema.extend({
  status: ticketStatusSchema.optional(),
  /** `true`: only requests still open (not resolved or closed). */
  active: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => value === 'true'),
});
export type ListTicketsQuery = z.infer<typeof listTicketsQuerySchema>;
