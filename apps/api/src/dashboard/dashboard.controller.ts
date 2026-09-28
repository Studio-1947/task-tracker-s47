import { BadRequestException, Controller, Get, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { Role } from '@task-tracker/shared';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { DashboardService } from './dashboard.service';
import { MonthlyReportService } from './monthly-report.service';

@Controller()
@UseGuards(RolesGuard)
export class DashboardController {
  constructor(
    private readonly dashboard: DashboardService,
    private readonly monthlyReports: MonthlyReportService,
  ) {}

  private reportMonth(month?: string): string {
    const fallback = new Date().toISOString().slice(0, 7);
    const value = month ?? fallback;
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) throw new BadRequestException('month must use YYYY-MM');
    return value;
  }

  /** Cross-workspace stats for admins (PRD §3.6). */
  @Get('admin/dashboard')
  @Roles(Role.ADMIN)
  admin() {
    return this.dashboard.admin();
  }

  @Get('admin/reports/monthly.csv')
  @Roles(Role.ADMIN)
  async monthlyCsv(@Query('month') month: string | undefined, @Res() res: Response): Promise<void> {
    const selectedMonth = this.reportMonth(month);
    res.type('text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="task-tracker-report-${selectedMonth}.csv"`);
    res.send(await this.monthlyReports.csv(selectedMonth));
  }

  @Get('admin/reports/monthly.pdf')
  @Roles(Role.ADMIN)
  async monthlyPdf(@Query('month') month: string | undefined, @Res() res: Response): Promise<void> {
    const selectedMonth = this.reportMonth(month);
    res.type('application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="task-tracker-report-${selectedMonth}.pdf"`);
    res.send(await this.monthlyReports.pdf(selectedMonth));
  }

  /** "My tasks" + my-workspace stats for the signed-in user (PRD §3.6). */
  @Get('me/dashboard')
  me(@CurrentUser('id') userId: string) {
    return this.dashboard.member(userId);
  }

  @Get('reports/wednesday')
  wednesdayReport(@Query('workspaceId') workspaceId: string) {
    if (!workspaceId) throw new BadRequestException('workspaceId is required');
    return this.dashboard.generateWednesdayReport(workspaceId);
  }

  @Get('reports/friday')
  fridayReport(@Query('workspaceId') workspaceId: string) {
    if (!workspaceId) throw new BadRequestException('workspaceId is required');
    return this.dashboard.generateFridayReport(workspaceId);
  }
}

