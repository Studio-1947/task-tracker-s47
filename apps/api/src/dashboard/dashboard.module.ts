import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { WorkspacesModule } from '../workspaces/workspaces.module';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { MonthlyReportService } from './monthly-report.service';

@Module({
  imports: [WorkspacesModule, AuditModule],
  controllers: [DashboardController],
  providers: [DashboardService, MonthlyReportService],
})
export class DashboardModule {}
