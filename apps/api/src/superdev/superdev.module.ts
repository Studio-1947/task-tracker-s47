import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../users/users.module';
import { WorkspacesModule } from '../workspaces/workspaces.module';
import { ErrorLogService } from './error-log.service';
import { FeatureFlagsService } from './feature-flags.service';
import { MaintenanceGuard } from './maintenance.guard';
import { SuperDevAuthService } from './superdev-auth.service';
import { SuperDevController } from './superdev.controller';
import { SuperDevGuard } from './superdev.guard';
import { SuperDevService } from './superdev.service';

@Module({
  imports: [JwtModule.register({}), AuthModule, UsersModule, WorkspacesModule],
  controllers: [SuperDevController],
  providers: [
    SuperDevAuthService,
    SuperDevGuard,
    SuperDevService,
    ErrorLogService,
    FeatureFlagsService,
    // Global maintenance-mode enforcement (exempts super-dev/auth/health).
    { provide: APP_GUARD, useClass: MaintenanceGuard },
  ],
  // Exported so the global exception filter can persist errors.
  exports: [ErrorLogService, FeatureFlagsService],
})
export class SuperDevModule {}
