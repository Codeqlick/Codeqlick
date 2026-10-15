import { z } from 'zod';

const fields = {
  title: z.string().trim().min(1).max(120),
  body: z.string().trim().min(1).max(10_000),
};

export const createSavedReplySchema = z.object(fields).strict();
export type CreateSavedReplyInput = z.infer<typeof createSavedReplySchema>;

export const updateSavedReplySchema = z
  .object({ title: fields.title.optional(), body: fields.body.optional() })
  .strict();
export type UpdateSavedReplyInput = z.infer<typeof updateSavedReplySchema>;
