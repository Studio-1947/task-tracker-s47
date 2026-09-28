import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Put, UseGuards } from '@nestjs/common';
import { Role, calendarExceptionSchema, calendarSettingsSchema, type CalendarExceptionInput, type CalendarSettingsInput } from '@task-tracker/shared';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { CalendarService } from './calendar.service';

@Controller('calendar')
@UseGuards(RolesGuard)
export class CalendarController {
  constructor(private readonly calendar: CalendarService) {}
  @Get() get() { return this.calendar.get(); }
  @Put() @Roles(Role.ADMIN) update(@Body(new ZodValidationPipe(calendarSettingsSchema)) body: CalendarSettingsInput) { return this.calendar.update(body); }
  @Post('exceptions') @Roles(Role.ADMIN) add(@Body(new ZodValidationPipe(calendarExceptionSchema)) body: CalendarExceptionInput) { return this.calendar.addException(body); }
  @Delete('exceptions/:id') @Roles(Role.ADMIN) remove(@Param('id', ParseUUIDPipe) id: string) { return this.calendar.removeException(id); }
}
