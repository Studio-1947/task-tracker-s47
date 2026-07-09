import { ExecutionContext, createParamDecorator } from '@nestjs/common';
import type { Request } from 'express';

export interface RequestUser {
  id: string;
  role: string;
  tokenVersion: number;
  sessionId?: string;
}

/** Injects the authenticated user (populated by JwtStrategy) into a handler param. */
export const CurrentUser = createParamDecorator(
  (data: keyof RequestUser | undefined, ctx: ExecutionContext) => {
    const req = ctx.switchToHttp().getRequest<Request & { user?: RequestUser }>();
    const user = req.user;
    return data && user ? user[data] : user;
  },
);
