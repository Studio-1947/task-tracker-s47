import { z } from 'zod';
export const namedOrganisationUnitSchema = z.object({ name: z.string().min(1).max(160) });
export const officeSchema = namedOrganisationUnitSchema.extend({ timezone: z.string().min(1).max(64).optional() });
export const teamMembersSchema = z.object({ userIds: z.array(z.string().uuid()) });
