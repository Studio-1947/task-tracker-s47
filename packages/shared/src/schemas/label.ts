import { z } from 'zod';

export const createLabelSchema = z.object({
  name: z.string().min(1).max(60),
  color: z
    .string()
    .regex(/^#([0-9a-fA-F]{6})$/, 'Must be a hex color like #4f46e5')
    .optional(),
});
export type CreateLabelInput = z.infer<typeof createLabelSchema>;
