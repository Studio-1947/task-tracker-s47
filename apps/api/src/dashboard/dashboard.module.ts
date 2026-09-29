import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { CalendarModule } from '../calendar/calendar.module';
import { WorkspacesModule } from '../workspaces/workspaces.module';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { MetricsService } from './metrics.service';
import { MonthlyReportService } from './monthly-report.service';
import { TasksModule } from '../tasks/tasks.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [WorkspacesModule, AuditModule, CalendarModule, TasksModule, NotificationsModule],
  controllers: [DashboardController],
  providers: [DashboardService, MonthlyReportService, MetricsService],
})
export class DashboardModule {}
