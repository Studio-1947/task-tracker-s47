import { z } from 'zod';

export const createWorkspaceSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(2000).optional(),
  color: z
    .string()
    .regex(/^#([0-9a-fA-F]{6})$/, 'Must be a hex color like #4f46e5')
    .optional(),
  /** Short uppercase prefix for human-readable task IDs, e.g. "ENG" -> ENG-142 (PRD §3.3). */
  taskPrefix: z
    .string()
    .regex(/^[A-Z]{2,6}$/, 'Prefix must be 2-6 uppercase letters')
    .optional(),
});
export type CreateWorkspaceInput = z.infer<typeof createWorkspaceSchema>;

export const updateWorkspaceSchema = z
  .object({
    name: z.string().min(1).max(120).optional(),
    description: z.string().max(2000).optional(),
    color: z
      .string()
      .regex(/^#([0-9a-fA-F]{6})$/)
      .optional(),
    isArchived: z.boolean().optional(),
  })
  .strict();
export type UpdateWorkspaceInput = z.infer<typeof updateWorkspaceSchema>;

export const updateWorkspaceMembersSchema = z
  .object({
    add: z.array(z.string().uuid()).optional(),
    remove: z.array(z.string().uuid()).optional(),
  })
  .strict();
export type UpdateWorkspaceMembersInput = z.infer<typeof updateWorkspaceMembersSchema>;
