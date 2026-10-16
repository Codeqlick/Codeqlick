import { z } from 'zod';
import { paginationSchema } from '../../common/schemas/common.schemas.js';

export const proposalStatusSchema = z.enum(['DRAFT', 'SENT', 'ACCEPTED', 'DECLINED', 'WITHDRAWN']);

/** Amounts in cents; at most 10 million euros per unit. */
const itemSchema = z
  .object({
    description: z.string().trim().min(1).max(500),
    quantity: z.number().int().min(1).max(10_000),
    unitPrice: z.number().int().min(0).max(1_000_000_000),
  })
  .strict();

const proposalFields = {
  title: z.string().trim().min(1).max(200),
  summary: z.string().trim().min(1).max(50_000),
  terms: z.string().trim().max(20_000).nullable().optional(),
  /** `yyyy-mm-dd`: last day it can be accepted. */
  validUntil: z.iso.date().nullable().optional(),
  /** One of the client's projects. */
  projectId: z.uuid().nullable().optional(),
  items: z.array(itemSchema).min(1).max(100),
};

export const createProposalSchema = z.object({ clientId: z.uuid(), ...proposalFields }).strict();
export type CreateProposalInput = z.infer<typeof createProposalSchema>;

/** Drafts only; the whole proposal is sent again (items are replaced). */
export const updateProposalSchema = z.object(proposalFields).strict();
export type UpdateProposalInput = z.infer<typeof updateProposalSchema>;

export const acceptProposalSchema = z
  .object({
    /** The client types their full name to accept. */
    name: z.string().trim().min(2).max(200),
  })
  .strict();
export type AcceptProposalInput = z.infer<typeof acceptProposalSchema>;

export const declineProposalSchema = z
  .object({ reason: z.string().trim().max(2000).nullable().optional() })
  .strict();
export type DeclineProposalInput = z.infer<typeof declineProposalSchema>;

export const listProposalsQuerySchema = paginationSchema.extend({
  status: proposalStatusSchema.optional(),
  clientId: z.uuid().optional(),
});
export type ListProposalsQuery = z.infer<typeof listProposalsQuerySchema>;

export const proposalTemplateSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    title: z.string().trim().min(1).max(200),
    summary: z.string().trim().min(1).max(50_000),
    terms: z.string().trim().max(20_000).nullable().optional(),
    validDays: z.number().int().min(1).max(365).nullable().optional(),
    items: z.array(itemSchema).min(1).max(100),
  })
  .strict();
export type ProposalTemplateInput = z.infer<typeof proposalTemplateSchema>;

/** Saves a proposal as a template under this name (replacing one with the same name). */
export const saveAsTemplateSchema = z.object({ name: z.string().trim().min(1).max(80) }).strict();
export type SaveAsTemplateInput = z.infer<typeof saveAsTemplateSchema>;
