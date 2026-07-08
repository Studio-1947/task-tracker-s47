import { Controller, Get, UseGuards } from '@nestjs/common';
import { Role } from '@task-tracker/shared';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { DashboardService } from './dashboard.service';

@Controller()
@UseGuards(RolesGuard)
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  /** Cross-workspace stats for admins (PRD §3.6). */
  @Get('admin/dashboard')
  @Roles(Role.ADMIN)
  admin() {
    return this.dashboard.admin();
  }

  /** "My tasks" + my-workspace stats for the signed-in user (PRD §3.6). */
  @Get('me/dashboard')
  me(@CurrentUser('id') userId: string) {
    return this.dashboard.member(userId);
  }
}
