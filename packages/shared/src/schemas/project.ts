import { z } from 'zod';

export const createProjectSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(2000).optional(),
  color: z
    .string()
    .regex(/^#([0-9a-fA-F]{6})$/, 'Must be a hex color like #4f46e5')
    .optional(),
  /** Short uppercase prefix for human-readable task IDs, e.g. "WEB" -> WEB-12. */
  taskPrefix: z
    .string()
    .regex(/^[A-Z]{2,6}$/, 'Prefix must be 2-6 uppercase letters')
    .optional(),
});
export type CreateProjectInput = z.infer<typeof createProjectSchema>;

export const updateProjectSchema = z
  .object({
    name: z.string().min(1).max(120).optional(),
    description: z.string().max(2000).nullable().optional(),
    color: z
      .string()
      .regex(/^#([0-9a-fA-F]{6})$/)
      .nullable()
      .optional(),
    isArchived: z.boolean().optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: 'No fields to update' });
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;
