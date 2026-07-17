import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  Role,
  attendancePunchSchema,
  createLeaveRequestSchema,
  createLeaveTypeSchema,
  reviewLeaveRequestSchema,
  setLeaveBalancesSchema,
  updateLeaveTypeSchema,
  type AttendancePunchInput,
  type CreateLeaveRequestInput,
  type CreateLeaveTypeInput,
  type ReviewLeaveRequestInput,
  type SetLeaveBalancesInput,
  type UpdateLeaveTypeInput,
} from '@task-tracker/shared';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { AttendanceService } from './attendance.service';

@Controller()
@UseGuards(RolesGuard)
export class AttendanceController {
  constructor(private readonly attendance: AttendanceService) {}

  /* ── leave types ── */
  @Get('leave-types')
  listTypes(@Query('includeInactive') includeInactive?: string) {
    return this.attendance.listLeaveTypes(includeInactive === 'true');
  }

  @Post('leave-types')
  @Roles(Role.ADMIN)
  createType(@Body(new ZodValidationPipe(createLeaveTypeSchema)) body: CreateLeaveTypeInput) {
    return this.attendance.createLeaveType(body);
  }

  @Patch('leave-types/:id')
  @Roles(Role.ADMIN)
  updateType(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateLeaveTypeSchema)) body: UpdateLeaveTypeInput,
  ) {
    return this.attendance.updateLeaveType(id, body);
  }

  @Delete('leave-types/:id')
  @Roles(Role.ADMIN)
  deleteType(@Param('id', ParseUUIDPipe) id: string) {
    return this.attendance.deleteLeaveType(id);
  }

  /* ── attendance (self) ── */
  @Get('attendance/today')
  today(@CurrentUser('id') userId: string) {
    return this.attendance.today(userId);
  }

  @Post('attendance/check-in')
  checkIn(
    @CurrentUser('id') userId: string,
    @Body(new ZodValidationPipe(attendancePunchSchema)) body: AttendancePunchInput,
  ) {
    return this.attendance.checkIn(userId, body);
  }

  @Post('attendance/check-out')
  checkOut(
    @CurrentUser('id') userId: string,
    @Body(new ZodValidationPipe(attendancePunchSchema)) body: AttendancePunchInput,
  ) {
    return this.attendance.checkOut(userId, body);
  }

  @Get('attendance/me')
  myMonth(@CurrentUser('id') userId: string, @Query('month') month?: string) {
    return this.attendance.myMonth(userId, month ?? new Date().toISOString().slice(0, 7));
  }

  @Get('attendance/team')
  @Roles(Role.ADMIN)
  teamLog(@Query('date') date?: string) {
    return this.attendance.teamLog(date);
  }

  /* ── leave requests ── */
  @Post('leaves')
  createLeave(
    @CurrentUser('id') userId: string,
    @Body(new ZodValidationPipe(createLeaveRequestSchema)) body: CreateLeaveRequestInput,
  ) {
    return this.attendance.createLeave(userId, body);
  }

  @Get('leaves/me')
  myLeaves(@CurrentUser('id') userId: string) {
    return this.attendance.myLeaves(userId);
  }

  @Post('leaves/:id/cancel')
  cancelLeave(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('id') userId: string) {
    return this.attendance.cancelLeave(id, userId);
  }

  @Get('leaves')
  @Roles(Role.ADMIN)
  listLeaves(@Query('status') status?: string) {
    return this.attendance.listLeaves(status);
  }

  @Post('leaves/:id/review')
  @Roles(Role.ADMIN)
  reviewLeave(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') reviewerId: string,
    @Body(new ZodValidationPipe(reviewLeaveRequestSchema)) body: ReviewLeaveRequestInput,
  ) {
    return this.attendance.reviewLeave(id, reviewerId, body);
  }

  /* ── balances ── */
  @Get('leaves/balances/me')
  myBalances(@CurrentUser('id') userId: string) {
    return this.attendance.balancesFor(userId);
  }

  @Get('leaves/balances/user/:userId')
  @Roles(Role.ADMIN)
  userBalances(@Param('userId', ParseUUIDPipe) userId: string) {
    return this.attendance.balancesFor(userId);
  }

  @Put('leaves/balances/user/:userId')
  @Roles(Role.ADMIN)
  setBalances(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body(new ZodValidationPipe(setLeaveBalancesSchema)) body: SetLeaveBalancesInput,
  ) {
    return this.attendance.setBalances(userId, body);
  }
}
