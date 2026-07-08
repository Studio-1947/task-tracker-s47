import { Controller, Get, Param, ParseUUIDPipe, Query, UseGuards } from '@nestjs/common';
import { Role } from '@task-tracker/shared';
import { CurrentUser, type RequestUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { WorkspacesService } from '../workspaces/workspaces.service';
import { AuditService } from './audit.service';

@Controller()
@UseGuards(RolesGuard)
export class AuditController {
  constructor(
    private readonly audit: AuditService,
    private readonly workspaces: WorkspacesService,
  ) {}

  /** Workspace-scoped activity feed (admin or members of the workspace). */
  @Get('workspaces/:id/activity')
  async workspaceActivity(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: RequestUser,
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '50',
  ) {
    await this.workspaces.assertCanAccess(id, user);
    return this.audit.workspaceActivity(id, Number(page), Number(pageSize));
  }

  /** Cross-workspace feed for the admin dashboard. */
  @Get('activity')
  @Roles(Role.ADMIN)
  globalActivity(@Query('page') page = '1', @Query('pageSize') pageSize = '50') {
    return this.audit.globalActivity(Number(page), Number(pageSize));
  }
}
