import { z } from 'zod';
import { nullableUrlSchema, paginationSchema } from '../../common/schemas/common.schemas.js';

export const projectPhaseSchema = z.enum([
  'DISCOVERY',
  'DESIGN',
  'DEVELOPMENT',
  'QA',
  'LAUNCHED',
  'SUPPORT',
  'ON_HOLD',
]);

/** ISO 8601 date (`2026-10-13`) or date-time; `null` clears it. */
const nullableDateSchema = z
  .string()
  .max(40)
  .refine((value) => !Number.isNaN(Date.parse(value)), { message: 'Invalid ISO 8601 date' })
  .nullable()
  .optional();

const projectFields = {
  name: z.string().trim().min(1).max(200),
  description: z.string().max(10_000).nullable().optional(),
  phase: projectPhaseSchema,
  progress: z.number().int().min(0).max(100),
  startDate: nullableDateSchema,
  dueDate: nullableDateSchema,
  stagingUrl: nullableUrlSchema,
  productionUrl: nullableUrlSchema,
  /** The client sees the hours logged on it. */
  showHours: z.boolean().optional(),
};

export const createProjectSchema = z
  .object({
    clientId: z.uuid(),
    ...projectFields,
  })
  .strict();
export type CreateProjectInput = z.infer<typeof createProjectSchema>;

export const updateProjectSchema = z
  .object({
    clientId: z.uuid().optional(),
    name: projectFields.name.optional(),
    description: projectFields.description,
    phase: projectFields.phase.optional(),
    progress: projectFields.progress.optional(),
    startDate: projectFields.startDate,
    dueDate: projectFields.dueDate,
    stagingUrl: projectFields.stagingUrl,
    productionUrl: projectFields.productionUrl,
    showHours: projectFields.showHours,
  })
  .strict();
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;

/** A release: an update that says which version went where. */
export const createReleaseSchema = z
  .object({
    /** e.g. `v1.4.0` or a short commit hash. */
    version: z.string().trim().min(1).max(40),
    environment: z.enum(['STAGING', 'PRODUCTION']),
    /** Where the client can try it; also becomes the project's staging or production URL. */
    url: z.url().max(2048).nullable().optional(),
    title: z.string().trim().min(1).max(200),
    /** Markdown: what changed. */
    body: z.string().min(1).max(50_000),
    notifyClient: z.boolean().default(false),
    requestApproval: z.boolean().default(false),
  })
  .strict();
export type CreateReleaseInput = z.infer<typeof createReleaseSchema>;

export const createProjectUpdateSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    body: z.string().min(1).max(50_000),
    /** Email the client a summary with a link to the project in the portal. */
    notifyClient: z.boolean().default(false),
    /** Ask the client to approve this update from the portal. */
    requestApproval: z.boolean().default(false),
  })
  .strict();
export type CreateProjectUpdateInput = z.infer<typeof createProjectUpdateSchema>;

const milestoneFields = {
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).nullable().optional(),
  dueDate: nullableDateSchema,
};

export const createMilestoneSchema = z.object(milestoneFields).strict();
export type CreateMilestoneInput = z.infer<typeof createMilestoneSchema>;

export const updateMilestoneSchema = z
  .object({
    title: milestoneFields.title.optional(),
    description: milestoneFields.description,
    dueDate: milestoneFields.dueDate,
    /** `true` marks it done now (keeping an earlier date if it was done already). */
    completed: z.boolean().optional(),
  })
  .strict();
export type UpdateMilestoneInput = z.infer<typeof updateMilestoneSchema>;

/** Every milestone of the project, once each, in the new order. */
export const reorderMilestonesSchema = z
  .object({ ids: z.array(z.uuid()).max(200) })
  .strict()
  .refine((value) => new Set(value.ids).size === value.ids.length, {
    message: 'Duplicate milestone ids',
    path: ['ids'],
  });
export type ReorderMilestonesInput = z.infer<typeof reorderMilestonesSchema>;

export const milestoneParamSchema = z.object({ id: z.uuid(), milestoneId: z.uuid() });
export type MilestoneParam = z.infer<typeof milestoneParamSchema>;

export const listProjectsQuerySchema = paginationSchema.extend({
  clientId: z.uuid().optional(),
  phase: projectPhaseSchema.optional(),
});
export type ListProjectsQuery = z.infer<typeof listProjectsQuerySchema>;

export const createUpdateCommentSchema = z
  .object({ body: z.string().trim().min(1).max(5000) })
  .strict();
export type CreateUpdateCommentInput = z.infer<typeof createUpdateCommentSchema>;

export const updateParamSchema = z.object({ id: z.uuid(), updateId: z.uuid() });
export type UpdateParam = z.infer<typeof updateParamSchema>;

export const projectFileParamSchema = z.object({ id: z.uuid(), fileId: z.uuid() });
export type ProjectFileParam = z.infer<typeof projectFileParamSchema>;
