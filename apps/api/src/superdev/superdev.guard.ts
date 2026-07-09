import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { getClientIp } from './ip-allowlist';
import { SUPERDEV_COOKIE, type SuperDevJwtPayload } from './superdev.constants';
import { SuperDevAuthService } from './superdev-auth.service';

export interface SuperDevRequest extends Request {
  superdev?: SuperDevJwtPayload;
}

/**
 * Gate for every /super-dev route except login. Reads the session token from the
 * httpOnly cookie (falls back to a Bearer header for API tooling) and verifies it.
 * When the feature is disabled it 404s via the auth service — no hint it exists.
 */
@Injectable()
export class SuperDevGuard implements CanActivate {
  constructor(private readonly auth: SuperDevAuthService) {}

  canActivate(context: ExecutionContext): boolean {
    this.auth.assertEnabled();
    const req = context.switchToHttp().getRequest<SuperDevRequest>();
    // Enforce the IP allowlist on every console request, not just login.
    this.auth.assertIpAllowed(getClientIp(req));

    const fromCookie = (req.cookies as Record<string, string> | undefined)?.[SUPERDEV_COOKIE];
    const header = req.headers.authorization;
    const fromHeader = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
    const token = fromCookie || fromHeader;
    if (!token) throw new UnauthorizedException('Super-dev session required');

    req.superdev = this.auth.verify(token);
    return true;
  }
}
