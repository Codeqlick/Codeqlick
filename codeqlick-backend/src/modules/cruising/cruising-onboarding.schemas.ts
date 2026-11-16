import type { z } from 'zod';
import { activeQuerySchema } from './cruising.schemas.js';

/** Phase 6 (decision 102): `?bbox=` on the 0.25° grid, optional (none: my country). */
export const suggestionsQuerySchema = activeQuerySchema.partial();
export type SuggestionsQuery = z.infer<typeof suggestionsQuerySchema>;
