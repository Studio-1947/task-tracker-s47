import { z } from 'zod';

export const searchQuerySchema = z.object({
  q: z.string().trim().min(2).max(100),
});
export type SearchQuery = z.infer<typeof searchQuerySchema>;
