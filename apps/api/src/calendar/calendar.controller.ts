import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Put, UseGuards } from '@nestjs/common';
import { Role, calendarExceptionSchema, bulkCalendarExceptionsSchema, updateCalendarSettingsSchema, scheduleGroupSchema, scheduleGroupAssignmentSchema, type CalendarExceptionInput, type BulkCalendarExceptionsInput, type UpdateCalendarSettingsInput, type ScheduleGroupInput, type ScheduleGroupAssignmentInput } from '@task-tracker/shared';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { CalendarService } from './calendar.service';

@Controller('calendar')
@UseGuards(RolesGuard)
export class CalendarController {
  constructor(private readonly calendar: CalendarService) {}
  @Get() get() { return this.calendar.get(); }
  @Put() @Roles(Role.ADMIN) update(@Body(new ZodValidationPipe(updateCalendarSettingsSchema)) body: UpdateCalendarSettingsInput) { return this.calendar.update(body); }
  @Get('history') @Roles(Role.ADMIN) history() { return this.calendar.history(); }
  @Get('schedule-groups') getScheduleGroups() { return this.calendar.listScheduleGroups(); }
  @Post('schedule-groups') @Roles(Role.ADMIN) createScheduleGroup(@Body(new ZodValidationPipe(scheduleGroupSchema)) body: ScheduleGroupInput) { return this.calendar.createScheduleGroup(body); }
  @Delete('schedule-groups/:id') @Roles(Role.ADMIN) removeScheduleGroup(@Param('id', ParseUUIDPipe) id: string) { return this.calendar.removeScheduleGroup(id); }
  @Get('schedule-groups/:id/assignments') listAssignments(@Param('id', ParseUUIDPipe) id: string) { return this.calendar.listAssignments(id); }
  @Post('schedule-groups/:id/assignments') @Roles(Role.ADMIN) assign(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(scheduleGroupAssignmentSchema)) body: ScheduleGroupAssignmentInput,
  ) { return this.calendar.assignToScheduleGroup(id, body); }
  @Delete('schedule-groups/assignments/:id') @Roles(Role.ADMIN) removeAssignment(@Param('id', ParseUUIDPipe) id: string) { return this.calendar.removeAssignment(id); }
  @Post('exceptions') @Roles(Role.ADMIN) add(@Body(new ZodValidationPipe(calendarExceptionSchema)) body: CalendarExceptionInput) { return this.calendar.addException(body); }
  @Post('exceptions/bulk') @Roles(Role.ADMIN) bulk(@Body(new ZodValidationPipe(bulkCalendarExceptionsSchema)) body: BulkCalendarExceptionsInput) { return this.calendar.bulkExceptions(body); }
  @Delete('exceptions/:id') @Roles(Role.ADMIN) remove(@Param('id', ParseUUIDPipe) id: string) { return this.calendar.removeException(id); }
}
