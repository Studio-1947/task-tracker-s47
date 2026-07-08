import { z } from 'zod';
import { ROLES, Role } from '../enums';

export const createUserSchema = z.object({
  name: z.string().min(1).max(120),
  email: z.string().email(),
  role: z.enum(ROLES as [Role, ...Role[]]).default('MEMBER'),
  /** Optional workspaces to bulk-assign the new user to on creation (PRD §3.2). */
  workspaceIds: z.array(z.string().uuid()).optional(),
});
export type CreateUserInput = z.infer<typeof createUserSchema>;

export const updateUserSchema = z
  .object({
    name: z.string().min(1).max(120).optional(),
    role: z.enum(ROLES as [Role, ...Role[]]).optional(),
    isActive: z.boolean().optional(),
  })
  .strict();
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
