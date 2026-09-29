import { Controller, Post, UseGuards } from '@nestjs/common';
import { Role } from '@task-tracker/shared';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { RemindersService } from './reminders.service';

/** Admin-triggerable "run now" — lets ops (and smoke tests) verify dispatch without waiting on the timer. */
@Controller('reminders')
@UseGuards(RolesGuard)
export class RemindersController {
  constructor(private readonly reminders: RemindersService) {}

  @Post('dispatch')
  @Roles(Role.ADMIN)
  dispatch() {
    return this.reminders.dispatchOnce();
  }
}
