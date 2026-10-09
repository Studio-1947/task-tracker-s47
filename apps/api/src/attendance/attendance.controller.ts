import {
  BadRequestException,
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
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { PDFParse } from 'pdf-parse';
import {
  Role,
  attendancePunchSchema,
  
  createCompOffRequestSchema,
  reviewCompOffRequestSchema,
  type CreateCompOffRequestInput,
  type ReviewCompOffRequestInput,

  createCorrectionSchema,
  reviewCorrectionSchema,
  createLeaveRequestSchema,
  createLeaveTypeSchema,
  reviewLeaveRequestSchema,
  setLeaveBalancesSchema,
  updateLeaveTypeSchema,
  type AttendancePunchInput,
  type CreateCorrectionInput,
  type ReviewCorrectionInput,
  type CreateLeaveRequestInput,
  type CreateLeaveTypeInput,
  type ReviewLeaveRequestInput,
  type SetLeaveBalancesInput,
  type UpdateLeaveTypeInput,
  organisationPolicySchema,
  createPayrollDraftSchema,
  payrollDecisionSchema,
  type OrganisationPolicyInput,
  type CreatePayrollDraftInput,
} from '@task-tracker/shared';
import { CurrentUser, type RequestUser } from '../common/decorators/current-user.decorator';
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

  @Post('leave-types/import-pdf')
  @Roles(Role.ADMIN)
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } }))
  async importLeavePolicyPdf(@UploadedFile() file?: Express.Multer.File) {
    if (!file || file.mimetype !== 'application/pdf') throw new BadRequestException('Upload a PDF up to 5 MB');
    const parser = new PDFParse({ data: file.buffer });
    const result = await parser.getText();
    await parser.destroy();
    return this.attendance.parseLeavePolicyPdfText(result.text);
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

  @Get('attendance/day-states')
  dayStates(@CurrentUser('id') userId: string, @Query('month') month?: string) {
    return this.attendance.monthDayStates(userId, month ?? new Date().toISOString().slice(0, 7));
  }

  @Get('attendance/state')
  dailyState(@CurrentUser('id') userId: string, @Query('date') date?: string) {
    return this.attendance.getDailyAttendanceState(userId, date ?? new Date().toISOString().slice(0, 10));
  }

  @Get('attendance/team-availability/access')
  availabilityAccess(@CurrentUser() user: RequestUser) {
    return this.attendance.canViewTeamAvailability(user);
  }

  @Get('attendance/team-availability')
  teamAvailability(@Query('from') from: string, @Query('to') to: string, @CurrentUser() user: RequestUser) {
    return this.attendance.teamAvailability(from, to, user);
  }

  @Get('attendance/team')
  @Roles(Role.ADMIN)
  teamLog(@Query('date') date?: string) {
    return this.attendance.teamLog(date);
  }

  @Get('attendance/timing/me')
  myTiming(@CurrentUser('id') userId: string, @Query('month') month?: string) {
    return this.attendance.myTiming(userId, month ?? new Date().toISOString().slice(0, 7));
  }

  @Get('attendance/timing/overview')
  timingOverview(@Query('month') month: string | undefined, @CurrentUser() user: RequestUser) {
    return this.attendance.timingOverview(month ?? new Date().toISOString().slice(0, 7), user);
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
  myBalances(@CurrentUser('id') userId: string, @Query('asOf') asOf?: string) {
    return this.attendance.balancesFor(userId, this.parseAsOf(asOf));
  }

  @Get('leaves/balances/user/:userId')
  @Roles(Role.ADMIN)
  userBalances(@Param('userId', ParseUUIDPipe) userId: string, @Query('asOf') asOf?: string) {
    return this.attendance.balancesFor(userId, this.parseAsOf(asOf));
  }

  /** Optional YYYY-MM-DD "as of" date for balance queries (defaults to today). */
  private parseAsOf(asOf?: string): string | undefined {
    if (asOf === undefined || asOf === '') return undefined;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf)) throw new BadRequestException('asOf must be a YYYY-MM-DD date');
    return asOf;
  }

  @Put('leaves/balances/user/:userId')
  @Roles(Role.ADMIN)
  setBalances(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body(new ZodValidationPipe(setLeaveBalancesSchema)) body: SetLeaveBalancesInput,
  ) {
    return this.attendance.setBalances(userId, body);
  }

  /* ── attendance corrections (H01) ── */
  @Post('attendance/corrections')
  requestCorrection(
    @CurrentUser('id') userId: string,
    @Body(new ZodValidationPipe(createCorrectionSchema)) body: CreateCorrectionInput,
  ) {
    return this.attendance.requestCorrection(userId, body);
  }

  @Get('attendance/corrections/me')
  myCorrections(@CurrentUser('id') userId: string) {
    return this.attendance.listCorrections(userId);
  }

  @Get('attendance/corrections')
  listCorrections(@Query('status') status: string | undefined, @CurrentUser() user: RequestUser) {
    return this.attendance.listCorrectionsForActor(user, status);
  }

  @Post('attendance/corrections/:id/review')
  reviewCorrection(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(reviewCorrectionSchema)) body: ReviewCorrectionInput,
  ) {
    return this.attendance.reviewCorrectionForActor(id, user, body);
  }

  @Get('admin/organisation-policy')
  @Roles(Role.ADMIN)
  getPolicy() { return this.attendance.getOrganisationPolicy(); }

  @Put('admin/organisation-policy')
  @Roles(Role.ADMIN)
  updatePolicy(@Body(new ZodValidationPipe(organisationPolicySchema)) body: OrganisationPolicyInput) { return this.attendance.updateOrganisationPolicy(body); }

  @Post('admin/payroll/statements')
  @Roles(Role.ADMIN)
  createPayrollDraft(@CurrentUser('id') actorId: string, @Body(new ZodValidationPipe(createPayrollDraftSchema)) body: CreatePayrollDraftInput) {
    return this.attendance.createPayrollDraft(body.userId, body.month, actorId);
  }

  @Get('admin/payroll/statements')
  @Roles(Role.ADMIN)
  listPayroll(@Query('month') month?: string) { return this.attendance.listPayrollStatements(month); }

  @Post('admin/payroll/statements/:id/review')
  @Roles(Role.ADMIN)
  reviewPayroll(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('id') actorId: string, @Body(new ZodValidationPipe(payrollDecisionSchema)) _body: { note: string }) {
    return this.attendance.reviewPayrollStatement(id, actorId);
  }

  @Post('admin/payroll/statements/:id/approve')
  @Roles(Role.ADMIN)
  approvePayroll(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('id') actorId: string, @Body(new ZodValidationPipe(payrollDecisionSchema)) _body: { note: string }) {
    return this.attendance.approvePayrollStatement(id, actorId);
  }

  @Post('admin/payroll/statements/:id/reopen')
  @Roles(Role.ADMIN)
  reopenPayroll(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('id') actorId: string, @Body(new ZodValidationPipe(payrollDecisionSchema)) body: { note: string }) {
    return this.attendance.reopenPayrollStatement(id, actorId, body.note);
  }


  /* ── Comp Off Requests ── */
  @Post('attendance/comp-off')
  requestCompOff(
    @CurrentUser('id') userId: string,
    @Body(new ZodValidationPipe(createCompOffRequestSchema)) body: CreateCompOffRequestInput,
  ) {
    return this.attendance.requestCompOff(userId, body);
  }

  @Get('attendance/comp-off/me')
  myCompOffs(@CurrentUser('id') userId: string) {
    return this.attendance.listCompOffs(userId);
  }

  @Get('attendance/comp-off')
  @Roles(Role.ADMIN)
  listAllCompOffs(@Query('status') status?: string) {
    return this.attendance.listAllCompOffs(status);
  }

  @Post('attendance/comp-off/:id/review')
  @Roles(Role.ADMIN)
  reviewCompOff(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') reviewerId: string,
    @Body(new ZodValidationPipe(reviewCompOffRequestSchema)) body: ReviewCompOffRequestInput,
  ) {
    return this.attendance.reviewCompOff(id, reviewerId, body);
  }

}
