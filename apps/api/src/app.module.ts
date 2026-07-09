import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { resolve } from 'node:path';
import { validateEnv } from './config/env';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { WorkspacesModule } from './workspaces/workspaces.module';
import { ProjectsModule } from './projects/projects.module';
import { TasksModule } from './tasks/tasks.module';
import { AuditModule } from './audit/audit.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { LabelsModule } from './labels/labels.module';
import { SearchModule } from './search/search.module';
import { FilesModule } from './files/files.module';
import { SuperDevModule } from './superdev/superdev.module';
import { HealthController } from './health/health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      // Local dev reads the repo-root .env; in prod, platform env vars win
      // (the file simply won't exist in the container, so process.env is used).
      envFilePath: [
        resolve(process.cwd(), '.env'),
        resolve(process.cwd(), '../../.env'),
        resolve(__dirname, '../../../.env'),
      ],
      validate: validateEnv,
    }),
    DatabaseModule,
    AuthModule,
    UsersModule,
    WorkspacesModule,
    ProjectsModule,
    TasksModule,
    AuditModule,
    DashboardModule,
    LabelsModule,
    SearchModule,
    FilesModule,
    SuperDevModule,
  ],
  controllers: [HealthController],
  providers: [
    // Auth-by-default: JwtAuthGuard runs globally; opt out with @Public().
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    // Registered via DI (not main.ts) so it can inject ErrorLogService and journal 5xx errors.
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
