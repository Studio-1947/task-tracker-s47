import { z } from 'zod';
export const namedOrganisationUnitSchema = z.object({ name: z.string().min(1).max(160) });
export const officeSchema = namedOrganisationUnitSchema.extend({ timezone: z.string().min(1).max(64).optional() });
export const teamMembersSchema = z.object({ userIds: z.array(z.string().uuid()) });
export const updateTeamSchema = z
  .object({
    name: z.string().min(1).max(120).optional(),
    managerId: z.string().uuid().nullable().optional(),
    parentTeamId: z.string().uuid().nullable().optional(),
  })
  .strict();
export type UpdateTeamInput = z.infer<typeof updateTeamSchema>;
export const movePersonSchema = z
  .object({
    reportsToId: z.string().uuid().nullable().optional(),
    designation: z.string().max(120).nullable().optional(),
  })
  .strict();
export type MovePersonInput = z.infer<typeof movePersonSchema>;

export const createOrgPersonSchema = z
  .object({
    name: z.string().min(1).max(120),
    email: z.string().email(),
    designation: z.string().max(120).optional(),
    reportsToId: z.string().uuid().nullable().optional(),
  })
  .strict();
export type CreateOrgPersonInput = z.infer<typeof createOrgPersonSchema>;
