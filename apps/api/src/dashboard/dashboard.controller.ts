import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { Role } from '@task-tracker/shared';
import { CurrentUser, type RequestUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { DashboardService } from './dashboard.service';
import { MetricsService, type CommitmentBasis } from './metrics.service';
import { MonthlyReportService } from './monthly-report.service';

@Controller()
@UseGuards(RolesGuard)
export class DashboardController {
  constructor(
    private readonly dashboard: DashboardService,
    private readonly monthlyReports: MonthlyReportService,
    private readonly metrics: MetricsService,
  ) {}

  private reportMonth(month?: string): string {
    const fallback = new Date().toISOString().slice(0, 7);
    const value = month ?? fallback;
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(value))
      throw new BadRequestException('month must use YYYY-MM');
    return value;
  }

  /** Cross-workspace stats for admins (PRD §3.6). */
  @Get('admin/dashboard')
  @Roles(Role.ADMIN)
  admin(@Query('workspaceIds') workspaceIds?: string) {
    return this.dashboard.admin(workspaceIds?.split(',').filter(Boolean) ?? []);
  }

  @Get('admin/reports/monthly.csv')
  @Roles(Role.ADMIN)
  async monthlyCsv(@Query('month') month: string | undefined, @Res() res: Response): Promise<void> {
    const selectedMonth = this.reportMonth(month);
    res.type('text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="task-tracker-report-${selectedMonth}.csv"`,
    );
    res.send(await this.monthlyReports.csv(selectedMonth));
  }

  @Get('admin/reports/monthly.pdf')
  @Roles(Role.ADMIN)
  async monthlyPdf(@Query('month') month: string | undefined, @Res() res: Response): Promise<void> {
    const selectedMonth = this.reportMonth(month);
    res.type('application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="task-tracker-report-${selectedMonth}.pdf"`,
    );
    res.send(await this.monthlyReports.pdf(selectedMonth));
  }

  /** "My tasks" + my-workspace stats for the signed-in user (PRD §3.6). */
  @Get('me/dashboard')
  me(@CurrentUser('id') userId: string) {
    return this.dashboard.member(userId);
  }

  @Get('reports/wednesday')
  wednesdayReport(@Query('workspaceId') workspaceId: string, @CurrentUser() user: RequestUser) {
    if (!workspaceId) throw new BadRequestException('workspaceId is required');
    return this.dashboard.generateWednesdayReport(workspaceId, user);
  }

  @Get('reports/friday')
  fridayReport(@Query('workspaceId') workspaceId: string, @CurrentUser() user: RequestUser) {
    if (!workspaceId) throw new BadRequestException('workspaceId is required');
    return this.dashboard.generateFridayReport(workspaceId, user);
  }

  @Post('reports/drafts')
  createReportDraft(
    @Body() body: { workspaceId: string; reportType: 'WEDNESDAY_PROGRESS' | 'FRIDAY_OUTCOMES' },
    @CurrentUser() user: RequestUser,
  ) {
    if (!body.workspaceId || !['WEDNESDAY_PROGRESS', 'FRIDAY_OUTCOMES'].includes(body.reportType))
      throw new BadRequestException('workspaceId and a valid reportType are required');
    return this.dashboard.createReportDraft(body.workspaceId, body.reportType, user);
  }

  @Get('reports/snapshots')
  listReportSnapshots(@Query('workspaceId') workspaceId: string, @CurrentUser() user: RequestUser) {
    if (!workspaceId) throw new BadRequestException('workspaceId is required');
    return this.dashboard.listReportSnapshots(workspaceId, user);
  }

  @Post('reports/:id/approve')
  approveReport(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { recipientIds?: string[] },
    @CurrentUser() user: RequestUser,
  ) {
    return this.dashboard.approveReport(id, body.recipientIds, user);
  }

  @Post('reports/:id/distribute')
  distributeReport(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: RequestUser) {
    return this.dashboard.distributeReport(id, user);
  }

  private basis(value?: string): CommitmentBasis {
    if (value === undefined || value === 'ORIGINAL') return 'ORIGINAL';
    if (value === 'REVISED') return 'REVISED';
    throw new BadRequestException('basis must be ORIGINAL or REVISED');
  }

  @Get('metrics/workspace')
  workspaceMetrics(
    @Query('workspaceId') workspaceId: string,
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('basis') basis: string | undefined,
    @CurrentUser() user: RequestUser,
  ) {
    if (!workspaceId || !from || !to)
      throw new BadRequestException('workspaceId, from and to are required');
    return this.metrics
      .workspaceMetrics(workspaceId, from, to, user, this.basis(basis))
      .catch((e: Error) => {
        if (e.message === 'Invalid metric period') throw new BadRequestException(e.message);
        throw e;
      });
  }

  /** The same figures as `metrics/workspace`, as an export built from that exact object. */
  @Get('metrics/workspace.csv')
  async workspaceMetricsCsv(
    @Query('workspaceId') workspaceId: string,
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('basis') basis: string | undefined,
    @CurrentUser() user: RequestUser,
    @Res() res: Response,
  ): Promise<void> {
    if (!workspaceId || !from || !to)
      throw new BadRequestException('workspaceId, from and to are required');
    const m = await this.metrics
      .workspaceMetrics(workspaceId, from, to, user, this.basis(basis))
      .catch((e: Error) => {
        if (e.message === 'Invalid metric period') throw new BadRequestException(e.message);
        throw e;
      });
    res.type('text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="workspace-metrics-${m.scope.from.slice(0, 10)}.csv"`,
    );
    res.send(await this.metrics.workspaceMetricsCsv(m));
  }
}
