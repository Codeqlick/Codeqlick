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
  })
  .strict();
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;

export const createProjectUpdateSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    body: z.string().min(1).max(50_000),
  })
  .strict();
export type CreateProjectUpdateInput = z.infer<typeof createProjectUpdateSchema>;

export const listProjectsQuerySchema = paginationSchema.extend({
  clientId: z.uuid().optional(),
  phase: projectPhaseSchema.optional(),
});
export type ListProjectsQuery = z.infer<typeof listProjectsQuerySchema>;

export const projectFileParamSchema = z.object({ id: z.uuid(), fileId: z.uuid() });
export type ProjectFileParam = z.infer<typeof projectFileParamSchema>;
