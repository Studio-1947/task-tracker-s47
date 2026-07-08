import { SetMetadata } from '@nestjs/common';
import type { Role } from '@task-tracker/shared';

export const ROLES_KEY = 'roles';
/** Restricts a route to the given role(s). Enforced by RolesGuard. */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
