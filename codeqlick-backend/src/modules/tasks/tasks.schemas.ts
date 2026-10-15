import { z } from 'zod';

export const taskStatusSchema = z.enum(['TODO', 'IN_PROGRESS', 'DONE']);

export const createTaskSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    description: z.string().trim().max(10_000).nullable().optional(),
  })
  .strict();
export type CreateTaskInput = z.infer<typeof createTaskSchema>;

export const updateTaskSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    description: z.string().trim().max(10_000).nullable().optional(),
    status: taskStatusSchema.optional(),
  })
  .strict();
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;

/** A support request turned into a task: on its own project unless another one is given. */
export const taskFromTicketSchema = z
  .object({
    projectId: z.uuid().optional(),
    title: z.string().trim().min(1).max(200).optional(),
  })
  .strict();
export type TaskFromTicketInput = z.infer<typeof taskFromTicketSchema>;

export const taskParamSchema = z.object({ id: z.uuid(), taskId: z.uuid() });
export type TaskParam = z.infer<typeof taskParamSchema>;

export const keyTaskParamSchema = z.object({ taskId: z.uuid() });
export type KeyTaskParam = z.infer<typeof keyTaskParamSchema>;

export const listTasksQuerySchema = z.object({
  /** `open`: not done yet. */
  status: z.enum(['TODO', 'IN_PROGRESS', 'DONE', 'open']).optional(),
});
export type ListTasksQuery = z.infer<typeof listTasksQuerySchema>;
