import { CanActivate, ExecutionContext, Injectable, ServiceUnavailableException } from '@nestjs/common';
import type { Request } from 'express';
import { FeatureFlagsService } from './feature-flags.service';
import { FLAG_MAINTENANCE_MODE } from './superdev.constants';

/**
 * Global guard: when the `maintenance_mode` flag is on, ordinary API traffic gets a
 * 503. Super-dev routes, auth (so the developer can still get in), and health checks
 * are always exempt so the console stays reachable to turn maintenance back off.
 */
@Injectable()
export class MaintenanceGuard implements CanActivate {
  constructor(private readonly flags: FeatureFlagsService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const path = req.path || req.url || '';
    if (
      path.startsWith('/api/super-dev') ||
      path.startsWith('/api/auth') ||
      path.startsWith('/api/health')
    ) {
      return true;
    }

    if (await this.flags.isEnabled(FLAG_MAINTENANCE_MODE)) {
      throw new ServiceUnavailableException('The application is temporarily under maintenance.');
    }
    return true;
  }
}
