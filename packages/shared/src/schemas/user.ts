import { z } from 'zod';
import { ROLES, Role } from '../enums';

export const createUserSchema = z.object({
  name: z.string().min(1).max(120),
  email: z.string().email(),
  role: z.enum(ROLES as [Role, ...Role[]]).default('MEMBER'),
  designation: z.string().max(120).optional(),
  gender: z.enum(['MALE', 'FEMALE', 'OTHER', 'UNSPECIFIED']).default('UNSPECIFIED'),
  /** Optional workspaces to bulk-assign the new user to on creation (PRD §3.2). */
  workspaceIds: z.array(z.string().uuid()).optional(),
});
export type CreateUserInput = z.infer<typeof createUserSchema>;

export const updateUserSchema = z
  .object({
    name: z.string().min(1).max(120).optional(),
    role: z.enum(ROLES as [Role, ...Role[]]).optional(),
    designation: z.string().max(120).nullable().optional(),
    gender: z.enum(['MALE', 'FEMALE', 'OTHER', 'UNSPECIFIED']).optional(),
    isActive: z.boolean().optional(),
  })
  .strict();
export type UpdateUserInput = z.infer<typeof updateUserSchema>;

export const updateMeSchema = z
  .object({
    name: z.string().min(1).max(120).optional(),
    designation: z.string().max(120).nullable().optional(),
    gender: z.enum(['MALE', 'FEMALE', 'OTHER', 'UNSPECIFIED']).optional(),
  })
  .strict();
export type UpdateMeInput = z.infer<typeof updateMeSchema>;
