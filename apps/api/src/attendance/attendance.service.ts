import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, desc, eq, gte, inArray, lt, lte, ne, type SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type {
  AttendanceDayStateItem,
  AttendancePunchInput,
  AttendanceRecordItem,
  AttendanceToday,
  AttendanceWithUser,
  CreateLeaveRequestInput,
  CreateLeaveTypeInput,
  GeoPoint,
  LeaveBalance,
  LeaveRequestItem,
  LeaveType,
  ReviewLeaveRequestInput,
  SetLeaveBalancesInput,
  StaffingWarning,
  UpdateLeaveTypeInput,
  OrganisationPolicyInput,
} from '@task-tracker/shared';
import { calculatePayableIndicator, computeLeaveBalance, dateRange, staffingBreaches, workingDayUnits } from '@task-tracker/shared';
import { DRIZZLE, type Database } from '../database/database.module';
import { CalendarService } from '../calendar/calendar.service';
import {
  attendanceRecords,
  attendanceCorrections,
  organisationPolicies,
  payrollStatements,
  leaveBalances,
  leaveRequests,
  leaveTypes,
  users,
  workspaceMembers,
  workspaces,
  type AttendanceRow,
  type LeaveTypeRow,
} from '../database/schema';

/** Local (server-timezone) date as YYYY-MM-DD — the attendance "work day". */
function localDateStr(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

@Injectable()
export class AttendanceService {
  constructor(@Inject(DRIZZLE) private readonly db: Database, private readonly calendar: CalendarService) {}

  /* ── mappers ── */
  private toLeaveType(t: LeaveTypeRow): LeaveType {
    return {
      id: t.id,
      name: t.name,
      color: t.color,
      defaultBalance: t.defaultBalance,
      accrualPerMonth: Number(t.accrualPerMonth),
      carryForwardMax: Number(t.carryForwardMax),
      carryForwardExpiryMonths: t.carryForwardExpiryMonths,
      isActive: t.isActive,
    };
  }

  private geo(lat: number | null, lng: number | null, accuracy: number | null): GeoPoint | null {
    if (lat === null || lng === null) return null;
    return { lat, lng, accuracy };
  }

  private toAttendance(r: AttendanceRow): AttendanceRecordItem {
    return {
      id: r.id,
      workDate: r.workDate,
      checkInAt: r.checkInAt.toISOString(),
      checkOutAt: r.checkOutAt ? r.checkOutAt.toISOString() : null,
      checkInLocation: this.geo(r.checkInLat, r.checkInLng, r.checkInAccuracy),
      checkOutLocation: this.geo(r.checkOutLat, r.checkOutLng, r.checkOutAccuracy),
    };
  }

  /* ── leave types (admin-managed) ── */
  async listLeaveTypes(includeInactive = false): Promise<LeaveType[]> {
    const rows = await this.db
      .select()
      .from(leaveTypes)
      .where(includeInactive ? undefined : eq(leaveTypes.isActive, true))
      .orderBy(leaveTypes.name);
    return rows.map((t) => this.toLeaveType(t));
  }

  async createLeaveType(input: CreateLeaveTypeInput): Promise<LeaveType> {
    const [t] = await this.db
      .insert(leaveTypes)
      .values({
        name: input.name,
        color: input.color ?? null,
        defaultBalance: input.defaultBalance,
        accrualPerMonth: String(input.accrualPerMonth),
        carryForwardMax: String(input.carryForwardMax),
        carryForwardExpiryMonths: input.carryForwardExpiryMonths,
      })
      .returning();
    return this.toLeaveType(t!);
  }

  async updateLeaveType(id: string, input: UpdateLeaveTypeInput): Promise<LeaveType> {
    const [t] = await this.db
      .update(leaveTypes)
      .set({
        ...input,
        accrualPerMonth: input.accrualPerMonth === undefined ? undefined : String(input.accrualPerMonth),
        carryForwardMax: input.carryForwardMax === undefined ? undefined : String(input.carryForwardMax),
        updatedAt: new Date(),
      })
      .where(eq(leaveTypes.id, id))
      .returning();
    if (!t) throw new NotFoundException('Leave type not found');
    return this.toLeaveType(t);
  }

  /** Soft-delete so historical requests keep their type. */
  async deleteLeaveType(id: string): Promise<{ ok: true }> {
    const [t] = await this.db
      .update(leaveTypes)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(leaveTypes.id, id))
      .returning();
    if (!t) throw new NotFoundException('Leave type not found');
    return { ok: true };
  }

  /* ── attendance ── */
  private async findToday(userId: string): Promise<AttendanceRow | undefined> {
    const [row] = await this.db
      .select()
      .from(attendanceRecords)
      .where(and(eq(attendanceRecords.userId, userId), eq(attendanceRecords.workDate, localDateStr())))
      .limit(1);
    return row;
  }

  async today(userId: string): Promise<AttendanceToday> {
    const row = await this.findToday(userId);
    return {
      workDate: localDateStr(),
      checkedIn: !!row,
      checkedOut: !!row?.checkOutAt,
      record: row ? this.toAttendance(row) : null,
    };
  }

  async checkIn(userId: string, geo: AttendancePunchInput): Promise<AttendanceRecordItem> {
    if (await this.findToday(userId)) {
      throw new ConflictException('You have already checked in today');
    }
    const [row] = await this.db
      .insert(attendanceRecords)
      .values({
        userId,
        workDate: localDateStr(),
        checkInAt: new Date(),
        checkInLat: geo.lat ?? null,
        checkInLng: geo.lng ?? null,
        checkInAccuracy: geo.accuracy ?? null,
      })
      .returning();
    return this.toAttendance(row!);
  }

  async checkOut(userId: string, geo: AttendancePunchInput): Promise<AttendanceRecordItem> {
    const existing = await this.findToday(userId);
    if (!existing) throw new BadRequestException('Check in before checking out');
    if (existing.checkOutAt) throw new ConflictException('You have already checked out today');
    const [row] = await this.db
      .update(attendanceRecords)
      .set({
        checkOutAt: new Date(),
        checkOutLat: geo.lat ?? null,
        checkOutLng: geo.lng ?? null,
        checkOutAccuracy: geo.accuracy ?? null,
        updatedAt: new Date(),
      })
      .where(eq(attendanceRecords.id, existing.id))
      .returning();
    return this.toAttendance(row!);
  }

  /** A user's records for a month ("YYYY-MM"). */
  async myMonth(userId: string, month: string): Promise<AttendanceRecordItem[]> {
    const { start, end } = monthRange(month);
    const rows = await this.db
      .select()
      .from(attendanceRecords)
      .where(
        and(
          eq(attendanceRecords.userId, userId),
          gte(attendanceRecords.workDate, start),
          lt(attendanceRecords.workDate, end),
        ),
      )
      .orderBy(attendanceRecords.workDate);
    return rows.map((r) => this.toAttendance(r));
  }

  /** Admin team log for one day (defaults to today). */
  async teamLog(dateStr?: string): Promise<AttendanceWithUser[]> {
    const day = dateStr ?? localDateStr();
    const rows = await this.db
      .select({ rec: attendanceRecords, u: users })
      .from(attendanceRecords)
      .innerJoin(users, eq(users.id, attendanceRecords.userId))
      .where(eq(attendanceRecords.workDate, day))
      .orderBy(attendanceRecords.checkInAt);
    return rows.map(({ rec, u }) => ({
      ...this.toAttendance(rec),
      user: { id: u.id, name: u.name, email: u.email, avatarKey: u.avatarKey },
    }));
  }

  /* ── leave requests ── */
  private async leaveQuery(where: SQL | undefined) {
    const reviewer = alias(users, 'reviewer');
    const rows = await this.db
      .select({ r: leaveRequests, t: leaveTypes, u: users, rev: reviewer })
      .from(leaveRequests)
      .innerJoin(leaveTypes, eq(leaveTypes.id, leaveRequests.leaveTypeId))
      .innerJoin(users, eq(users.id, leaveRequests.userId))
      .leftJoin(reviewer, eq(reviewer.id, leaveRequests.reviewedById))
      .where(where)
      .orderBy(desc(leaveRequests.createdAt));
    return rows.map(({ r, t, u, rev }): LeaveRequestItem => ({
      id: r.id,
      user: { id: u.id, name: u.name, email: u.email, avatarKey: u.avatarKey },
      leaveTypeId: r.leaveTypeId,
      typeName: t.name,
      color: t.color,
      startDate: r.startDate,
      endDate: r.endDate,
      halfDay: r.halfDay,
      days: Number(r.days),
      reason: r.reason,
      status: r.status as LeaveRequestItem['status'],
      reviewedBy: rev ? { id: rev.id, name: rev.name, email: rev.email, avatarKey: rev.avatarKey } : null,
      reviewedAt: r.reviewedAt ? r.reviewedAt.toISOString() : null,
      reviewNote: r.reviewNote,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  async createLeave(userId: string, input: CreateLeaveRequestInput): Promise<LeaveRequestItem> {
    const [type] = await this.db
      .select()
      .from(leaveTypes)
      .where(and(eq(leaveTypes.id, input.leaveTypeId), eq(leaveTypes.isActive, true)))
      .limit(1);
    if (!type) throw new NotFoundException('Leave type not found');

    // Reject dates that overlap an existing pending/approved request (no double-booking).
    // Two ranges overlap when start <= otherEnd AND end >= otherStart.
    const [clash] = await this.db
      .select({ id: leaveRequests.id, startDate: leaveRequests.startDate, endDate: leaveRequests.endDate })
      .from(leaveRequests)
      .where(
        and(
          eq(leaveRequests.userId, userId),
          inArray(leaveRequests.status, ['PENDING', 'APPROVED']),
          lte(leaveRequests.startDate, input.endDate),
          gte(leaveRequests.endDate, input.startDate),
        ),
      )
      .limit(1);
    if (clash) {
      throw new ConflictException(
        `You already have a leave request for ${clash.startDate}–${clash.endDate} that overlaps these dates`,
      );
    }

    const days = await this.calendar.leaveUnits(input.startDate, input.endDate, input.halfDay);
    if (days === 0) throw new BadRequestException('The selected range contains no scheduled working days');
    const [created] = await this.db
      .insert(leaveRequests)
      .values({
        userId,
        leaveTypeId: input.leaveTypeId,
        startDate: input.startDate,
        endDate: input.endDate,
        halfDay: input.halfDay,
        days: String(days),
        reason: input.reason ?? null,
      })
      .returning({ id: leaveRequests.id });
    const [item] = await this.leaveQuery(eq(leaveRequests.id, created!.id));
    return (await this.withStaffingWarnings([item!]))[0]!;
  }

  async myLeaves(userId: string): Promise<LeaveRequestItem[]> {
    return this.withStaffingWarnings(await this.leaveQuery(eq(leaveRequests.userId, userId)));
  }

  async listLeaves(status?: string): Promise<LeaveRequestItem[]> {
    return this.withStaffingWarnings(await this.leaveQuery(status ? eq(leaveRequests.status, status) : undefined));
  }

  async reviewLeave(id: string, reviewerId: string, input: ReviewLeaveRequestInput): Promise<LeaveRequestItem> {
    const [current] = await this.db.select().from(leaveRequests).where(eq(leaveRequests.id, id)).limit(1);
    if (!current) throw new NotFoundException('Leave request not found');
    if (current.status !== 'PENDING') throw new BadRequestException('This request has already been reviewed');

    if (input.status === 'APPROVED') {
      // Controls (PRD leave rules): never approve beyond the balance, and don't
      // strip a team below the staffing limit without an explained override.
      const [type] = await this.db.select().from(leaveTypes).where(eq(leaveTypes.id, current.leaveTypeId)).limit(1);
      if (type && (type.defaultBalance > 0 || Number(type.accrualPerMonth) > 0)) {
        const balance = (await this.balancesFor(current.userId, current.startDate)).find((b) => b.leaveTypeId === type.id);
        if (balance && Number(current.days) > balance.remaining) {
          throw new BadRequestException(
            `Insufficient ${type.name} balance: ${balance.remaining} day(s) available, ${Number(current.days)} requested`,
          );
        }
      }
      const warnings = await this.staffingWarningsFor(current.userId, current.startDate, current.endDate);
      if (warnings.length) {
        if (!input.overrideStaffingClash) {
          throw new ConflictException(
            `Approving this would leave too few people on ${warnings[0]!.date} in ${warnings[0]!.workspaceName} (${warnings[0]!.percentAway}% away). Approve with an override and a note to proceed.`,
          );
        }
        if (!input.note?.trim()) throw new BadRequestException('A note is required to override a staffing clash');
      }
    }

    await this.db
      .update(leaveRequests)
      .set({
        status: input.status,
        reviewedById: reviewerId,
        reviewedAt: new Date(),
        reviewNote: input.note ?? null,
        updatedAt: new Date(),
      })
      .where(eq(leaveRequests.id, id));
    const [item] = await this.leaveQuery(eq(leaveRequests.id, id));
    return item!;
  }

  /** Members can cancel their own still-pending request. */
  async cancelLeave(id: string, userId: string): Promise<LeaveRequestItem> {
    const [current] = await this.db
      .select({ userId: leaveRequests.userId, status: leaveRequests.status })
      .from(leaveRequests)
      .where(eq(leaveRequests.id, id))
      .limit(1);
    if (!current || current.userId !== userId) throw new NotFoundException('Leave request not found');
    if (current.status !== 'PENDING') throw new BadRequestException('Only pending requests can be cancelled');

    await this.db
      .update(leaveRequests)
      .set({ status: 'CANCELLED', updatedAt: new Date() })
      .where(eq(leaveRequests.id, id));
    const [item] = await this.leaveQuery(eq(leaveRequests.id, id));
    return item!;
  }

  /* ── balances ── */
  async balancesFor(userId: string, asOf: string = localDateStr()): Promise<LeaveBalance[]> {
    const [types, overrides, taken, [person]] = await Promise.all([
      this.db.select().from(leaveTypes).where(eq(leaveTypes.isActive, true)).orderBy(leaveTypes.name),
      this.db.select().from(leaveBalances).where(eq(leaveBalances.userId, userId)),
      this.db
        .select({ leaveTypeId: leaveRequests.leaveTypeId, startDate: leaveRequests.startDate, days: leaveRequests.days })
        .from(leaveRequests)
        .where(and(eq(leaveRequests.userId, userId), eq(leaveRequests.status, 'APPROVED'))),
      this.db.select({ createdAt: users.createdAt }).from(users).where(eq(users.id, userId)).limit(1),
    ]);
    const overrideBy = new Map(overrides.map((o) => [o.leaveTypeId, o.allotted]));
    const joinedOn = localDateStr(person?.createdAt ?? new Date());
    return types.map((t) => {
      const r = computeLeaveBalance(
        {
          annualAllotment: overrideBy.get(t.id) ?? t.defaultBalance,
          accrualPerMonth: Number(t.accrualPerMonth),
          carryForwardMax: Number(t.carryForwardMax),
          carryForwardExpiryMonths: t.carryForwardExpiryMonths,
        },
        joinedOn,
        asOf,
        taken.filter((x) => x.leaveTypeId === t.id).map((x) => ({ startDate: x.startDate, days: Number(x.days) })),
      );
      return {
        leaveTypeId: t.id,
        typeName: t.name,
        color: t.color,
        allotted: r.accrued,
        carriedForward: r.carriedForward,
        expired: r.expired,
        used: r.used,
        remaining: r.remaining,
        nextAccrualOn: r.nextAccrualOn,
        carryForwardExpiresOn: r.carryForwardExpiresOn,
      };
    });
  }

  /* ── staffing clashes ── */

  /**
   * For each workspace the person belongs to, the days in the range on which
   * approving them would put more of the team away than the policy allows.
   * Only scheduled working days count; a half-day of leave counts as half a person.
   */
  private async staffingWarningsFor(userId: string, start: string, end: string): Promise<StaffingWarning[]> {
    const policy = await this.getOrganisationPolicy();
    const maxPercent = policy?.maxConcurrentLeavePercent ?? 100;
    if (maxPercent >= 100) return [];
    const memberships = await this.db
      .select({ workspaceId: workspaceMembers.workspaceId, workspaceName: workspaces.name })
      .from(workspaceMembers)
      .innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
      .where(and(eq(workspaceMembers.userId, userId), eq(workspaces.isArchived, false)));
    if (!memberships.length) return [];
    const calendar = await this.calendar.get();
    const workdays = calendar.settings?.workdays ?? [1, 2, 3, 4, 5];
    const holidays = new Set(calendar.exceptions.filter((e) => e.kind === 'HOLIDAY').map((e) => e.date));

    const days: string[] = [];
    for (let d = new Date(`${start}T00:00:00.000Z`), i = 0; d <= new Date(`${end}T00:00:00.000Z`) && i < 92; d.setUTCDate(d.getUTCDate() + 1), i += 1) {
      const key = d.toISOString().slice(0, 10);
      if (workdays.includes(d.getUTCDay()) && !holidays.has(key)) days.push(key);
    }
    const warnings: StaffingWarning[] = [];
    for (const m of memberships) {
      const people = await this.db
        .select({ id: workspaceMembers.userId })
        .from(workspaceMembers)
        .innerJoin(users, eq(users.id, workspaceMembers.userId))
        .where(and(eq(workspaceMembers.workspaceId, m.workspaceId), eq(users.isActive, true)));
      const others = people.map((p) => p.id).filter((id) => id !== userId);
      if (!others.length) continue;
      const away = await this.db
        .select({ userId: leaveRequests.userId, startDate: leaveRequests.startDate, endDate: leaveRequests.endDate, halfDay: leaveRequests.halfDay })
        .from(leaveRequests)
        .where(and(inArray(leaveRequests.userId, others), eq(leaveRequests.status, 'APPROVED'), lte(leaveRequests.startDate, end), gte(leaveRequests.endDate, start), ne(leaveRequests.userId, userId)));
      const loads = days.map((date) => ({
        date,
        onLeave: away.filter((a) => a.startDate <= date && a.endDate >= date).reduce((sum, a) => sum + (a.halfDay ? 0.5 : 1), 0),
        members: people.length,
      }));
      for (const b of staffingBreaches(loads, maxPercent)) {
        warnings.push({ workspaceId: m.workspaceId, workspaceName: m.workspaceName, date: b.date, onLeave: b.onLeave, members: b.members, percentAway: b.percentAway });
      }
    }
    return warnings.sort((a, b) => b.percentAway - a.percentAway);
  }

  private async withStaffingWarnings(items: LeaveRequestItem[]): Promise<LeaveRequestItem[]> {
    return Promise.all(
      items.map(async (i) => (i.status === 'PENDING' ? { ...i, staffingWarnings: await this.staffingWarningsFor(i.user.id, i.startDate, i.endDate) } : i)),
    );
  }

  /** Admin: set per-user allotment overrides (upsert). */
  async setBalances(userId: string, input: SetLeaveBalancesInput): Promise<LeaveBalance[]> {
    const [u] = await this.db.select({ id: users.id }).from(users).where(eq(users.id, userId)).limit(1);
    if (!u) throw new NotFoundException('User not found');
    for (const b of input.balances) {
      await this.db
        .insert(leaveBalances)
        .values({ userId, leaveTypeId: b.leaveTypeId, allotted: b.allotted })
        .onConflictDoUpdate({
          target: [leaveBalances.userId, leaveBalances.leaveTypeId],
          set: { allotted: b.allotted, updatedAt: new Date() },
        });
    }
    return this.balancesFor(userId);
  }

  /* ── Attendance Corrections & Day States (H01) ── */

  async requestCorrection(
    userId: string,
    input: { workDate: string; proposedCheckInAt: string; proposedCheckOutAt: string; reason: string },
  ) {
    const [existingRec] = await this.db
      .select({ id: attendanceRecords.id })
      .from(attendanceRecords)
      .where(and(eq(attendanceRecords.userId, userId), eq(attendanceRecords.workDate, input.workDate)))
      .limit(1);

    const [correction] = await this.db
      .insert(attendanceCorrections)
      .values({
        attendanceRecordId: existingRec?.id ?? null,
        userId,
        workDate: input.workDate,
        proposedCheckInAt: new Date(input.proposedCheckInAt),
        proposedCheckOutAt: new Date(input.proposedCheckOutAt),
        reason: input.reason,
        status: 'PENDING',
      })
      .returning();

    return correction;
  }

  async listCorrections(userId?: string, status?: string) {
    const reviewer = alias(users, 'reviewer');
    const conds = [];
    if (userId) conds.push(eq(attendanceCorrections.userId, userId));
    if (status) conds.push(eq(attendanceCorrections.status, status));

    const rows = await this.db
      .select({ c: attendanceCorrections, u: users, rev: reviewer })
      .from(attendanceCorrections)
      .innerJoin(users, eq(users.id, attendanceCorrections.userId))
      .leftJoin(reviewer, eq(reviewer.id, attendanceCorrections.reviewerId))
      .where(conds.length ? and(...conds) : undefined)
      .orderBy(desc(attendanceCorrections.createdAt));

    return rows.map(({ c, u, rev }) => ({
      id: c.id,
      attendanceRecordId: c.attendanceRecordId,
      workDate: c.workDate,
      proposedCheckInAt: c.proposedCheckInAt.toISOString(),
      proposedCheckOutAt: c.proposedCheckOutAt.toISOString(),
      reason: c.reason,
      status: c.status,
      user: { id: u.id, name: u.name, email: u.email, avatarKey: u.avatarKey },
      reviewer: rev ? { id: rev.id, name: rev.name, email: rev.email, avatarKey: rev.avatarKey } : null,
      reviewNote: c.reviewNote,
      reviewedAt: c.reviewedAt ? c.reviewedAt.toISOString() : null,
      createdAt: c.createdAt.toISOString(),
    }));
  }

  async reviewCorrection(id: string, reviewerId: string, input: { status: 'APPROVED' | 'REJECTED'; note?: string }) {
    const [corr] = await this.db.select().from(attendanceCorrections).where(eq(attendanceCorrections.id, id)).limit(1);
    if (!corr) throw new NotFoundException('Correction request not found');
    if (corr.status !== 'PENDING') throw new BadRequestException('Correction request already reviewed');

    const now = new Date();
    await this.db
      .update(attendanceCorrections)
      .set({
        status: input.status,
        reviewerId,
        reviewNote: input.note ?? null,
        reviewedAt: now,
        updatedAt: now,
      })
      .where(eq(attendanceCorrections.id, id));

    if (input.status === 'APPROVED') {
      if (corr.attendanceRecordId) {
        await this.db
          .update(attendanceRecords)
          .set({
            checkInAt: corr.proposedCheckInAt,
            checkOutAt: corr.proposedCheckOutAt,
            updatedAt: now,
          })
          .where(eq(attendanceRecords.id, corr.attendanceRecordId));
      } else {
        await this.db.insert(attendanceRecords).values({
          userId: corr.userId,
          workDate: corr.workDate,
          checkInAt: corr.proposedCheckInAt,
          checkOutAt: corr.proposedCheckOutAt,
        });
      }
    }

    const [updated] = await this.listCorrections(undefined, undefined);
    return updated;
  }

  /**
   * Every day of a month classified in one pass (spec section 8): worked, paid or
   * unpaid leave, absence, holiday, weekly off, pending correction or upcoming.
   * Weekends and holidays are never "absence", and absence is only ever a past
   * scheduled working day with no record and no approved leave.
   */
  async monthDayStates(userId: string, month: string): Promise<AttendanceDayStateItem[]> {
    const { start, end } = monthRange(month);
    return this.dayStatesBetween(userId, start, end);
  }

  /**
   * Who is in, on leave, or off, for every active person across a short range
   * (spec section 11 "team availability"). `to` is inclusive; capped at 31 days.
   */
  async teamAvailability(from: string, to: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || to < from) throw new BadRequestException('from and to must be YYYY-MM-DD with to on or after from');
    const days = dateRange(from, to);
    if (days.length > 31) throw new BadRequestException('Choose a range of at most 31 days');
    const end = new Date(new Date(`${to}T00:00:00Z`).getTime() + 86_400_000).toISOString().slice(0, 10);
    const people = await this.db.select({ id: users.id, name: users.name, email: users.email, avatarKey: users.avatarKey }).from(users).where(eq(users.isActive, true)).orderBy(users.name);
    const rows = [] as Array<{ user: (typeof people)[number]; days: AttendanceDayStateItem[] }>;
    for (const person of people) rows.push({ user: person, days: await this.dayStatesBetween(person.id, from, end) });
    return { from, to, dates: days, people: rows };
  }

  private async dayStatesBetween(userId: string, start: string, end: string): Promise<AttendanceDayStateItem[]> {
    const [policy, calendar, records, leaves, pending] = await Promise.all([
      this.getOrganisationPolicy(),
      this.calendar.get(),
      this.db.select().from(attendanceRecords).where(and(eq(attendanceRecords.userId, userId), gte(attendanceRecords.workDate, start), lt(attendanceRecords.workDate, end))),
      this.db.select({ request: leaveRequests, type: leaveTypes }).from(leaveRequests).innerJoin(leaveTypes, eq(leaveTypes.id, leaveRequests.leaveTypeId))
        .where(and(eq(leaveRequests.userId, userId), eq(leaveRequests.status, 'APPROVED'), lt(leaveRequests.startDate, end), gte(leaveRequests.endDate, start))),
      this.db.select({ workDate: attendanceCorrections.workDate }).from(attendanceCorrections)
        .where(and(eq(attendanceCorrections.userId, userId), eq(attendanceCorrections.status, 'PENDING'), gte(attendanceCorrections.workDate, start), lt(attendanceCorrections.workDate, end))),
    ]);
    const workdays = calendar.settings?.workdays ?? [1, 2, 3, 4, 5];
    const paidNames = new Set(policy?.paidLeaveNames ?? []);
    const byDate = new Map(records.map((r) => [r.workDate, r]));
    const pendingDates = new Set(pending.map((r) => r.workDate));
    const today = localDateStr();
    const out: AttendanceDayStateItem[] = [];
    for (const date of dateRange(start, new Date(new Date(`${end}T00:00:00Z`).getTime() - 86_400_000).toISOString().slice(0, 10))) {
      const exception = calendar.exceptions.find((e) => e.date === date);
      const leave = leaves.find((l) => l.request.startDate <= date && l.request.endDate >= date);
      const rec = byDate.get(date);
      const base = { date, missingCheckout: false, halfDay: !!leave?.request.halfDay };
      if (exception?.kind === 'HOLIDAY') { out.push({ ...base, state: 'HOLIDAY', detail: (exception as { name?: string }).name ?? null }); continue; }
      const scheduled = exception?.kind === 'WORKING_DAY' || exception?.kind === 'HALF_DAY' || workdays.includes(new Date(`${date}T00:00:00Z`).getUTCDay());
      if (!scheduled) { out.push({ ...base, state: 'WEEKLY_OFF', detail: null }); continue; }
      if (pendingDates.has(date)) { out.push({ ...base, state: 'PENDING_CORRECTION', detail: 'Awaiting a decision', missingCheckout: !!rec && !rec.checkOutAt }); continue; }
      if (rec) {
        out.push({ ...base, state: 'WORKED', detail: null, missingCheckout: date < today && !rec.checkOutAt });
        continue;
      }
      if (leave) { out.push({ ...base, state: paidNames.has(leave.type.name) ? 'PAID_LEAVE' : 'UNPAID_LEAVE', detail: leave.type.name }); continue; }
      out.push({ ...base, state: date < today ? 'ABSENCE' : 'UPCOMING', detail: null });
    }
    return out;
  }

  async getDailyAttendanceState(userId: string, dateStr: string): Promise<string> {
    const calendar = await this.calendar.get();
    const exception = calendar.exceptions.find((item) => item.date === dateStr);
    if (exception?.kind === 'HOLIDAY') return 'HOLIDAY';
    const d = new Date(`${dateStr}T00:00:00Z`);
    const dayOfWeek = d.getUTCDay();
    if (!exception || exception.kind !== 'WORKING_DAY') {
      if (!(calendar.settings?.workdays ?? [1, 2, 3, 4, 5]).includes(dayOfWeek)) return 'WEEKLY_OFF';
    }

    const [pending] = await this.db
      .select({ id: attendanceCorrections.id })
      .from(attendanceCorrections)
      .where(and(eq(attendanceCorrections.userId, userId), eq(attendanceCorrections.workDate, dateStr), eq(attendanceCorrections.status, 'PENDING')))
      .limit(1);
    if (pending) return 'PENDING_CORRECTION';

    const [rec] = await this.db
      .select({ id: attendanceRecords.id })
      .from(attendanceRecords)
      .where(and(eq(attendanceRecords.userId, userId), eq(attendanceRecords.workDate, dateStr)))
      .limit(1);
    if (rec) return 'WORKED';

    const [leave] = await this.db
      .select({ id: leaveRequests.id })
      .from(leaveRequests)
      .where(and(eq(leaveRequests.userId, userId), eq(leaveRequests.status, 'APPROVED'), lte(leaveRequests.startDate, dateStr), gte(leaveRequests.endDate, dateStr)))
      .limit(1);
    if (leave) return 'PAID_LEAVE';

    return 'ABSENCE';
  }

  async getOrganisationPolicy() {
    const [policy] = await this.db.select().from(organisationPolicies).where(eq(organisationPolicies.id, 1));
    return policy;
  }

  async updateOrganisationPolicy(input: OrganisationPolicyInput) {
    const current = await this.getOrganisationPolicy();
    const values = { ...input, earnedLeaveMonthly: String(input.earnedLeaveMonthly), casualLeaveMonthly: String(input.casualLeaveMonthly) };
    const [policy] = await this.db.insert(organisationPolicies).values({ id: 1, ...values, version: (current?.version ?? 0) + 1 })
      .onConflictDoUpdate({ target: organisationPolicies.id, set: { ...values, version: (current?.version ?? 0) + 1, updatedAt: new Date() } }).returning();
    return policy;
  }

  async createPayrollDraft(userId: string, month: string, preparedById: string) {
    const { start, end } = monthRange(month);
    const [policy, calendar, records, paidLeaves, pending, versions] = await Promise.all([
      this.getOrganisationPolicy(), this.calendar.get(),
      this.db.select().from(attendanceRecords).where(and(eq(attendanceRecords.userId, userId), gte(attendanceRecords.workDate, start), lt(attendanceRecords.workDate, end))),
      this.db.select({ request: leaveRequests, type: leaveTypes }).from(leaveRequests).innerJoin(leaveTypes, eq(leaveTypes.id, leaveRequests.leaveTypeId))
        .where(and(eq(leaveRequests.userId, userId), eq(leaveRequests.status, 'APPROVED'), gte(leaveRequests.startDate, start), lt(leaveRequests.startDate, end))),
      this.db.select({ id: attendanceCorrections.id }).from(attendanceCorrections).where(and(eq(attendanceCorrections.userId, userId), eq(attendanceCorrections.status, 'PENDING'), gte(attendanceCorrections.workDate, start), lt(attendanceCorrections.workDate, end))).limit(1),
      this.db.select({ version: payrollStatements.version }).from(payrollStatements).where(and(eq(payrollStatements.userId, userId), eq(payrollStatements.month, month))).orderBy(desc(payrollStatements.version)).limit(1),
    ]);
    if (!policy) throw new NotFoundException('Organisation policy is not configured');
    if (pending.length && policy.unresolvedCorrectionTreatment === 'EXCLUDE') throw new ConflictException('Resolve pending attendance corrections before preparing payroll inputs');
    const settings = calendar.settings;
    if (!settings) throw new NotFoundException('Working calendar is not configured');
    const minutesPerDay = Math.max(0, settings.endMinute - settings.startMinute - settings.unpaidBreakMinutes);
    const monthEnd = new Date(`${end}T00:00:00Z`); monthEnd.setUTCDate(monthEnd.getUTCDate() - 1);
    const lastDay = monthEnd.toISOString().slice(0, 10);
    const scheduledUnits = workingDayUnits(start, lastDay, settings.workdays, calendar.exceptions);
    const scheduledMinutes = Math.round(scheduledUnits * minutesPerDay);
    const workedMinutes = records.reduce((sum, record) => sum + (record.checkOutAt ? Math.max(0, Math.round((record.checkOutAt.getTime() - record.checkInAt.getTime()) / 60000)) : 0), 0);
    const paidNames = new Set(policy.paidLeaveNames);
    const paidLeaveMinutes = Math.round(paidLeaves.filter((row) => paidNames.has(row.type.name)).reduce((sum, row) => sum + Number(row.request.days), 0) * minutesPerDay);
    const indicator = calculatePayableIndicator(scheduledMinutes, workedMinutes, paidLeaveMinutes);
    const [statement] = await this.db.insert(payrollStatements).values({ userId, month, version: (versions[0]?.version ?? 0) + 1, policyVersion: policy.version,
      scheduledMinutes, workedMinutes, paidLeaveMinutes, payableMinutes: indicator.payableMinutes,
      payablePercentage: indicator.percentage === null ? null : indicator.percentage.toFixed(2), status: 'DRAFT', preparedById }).returning();
    return { ...statement, payablePercentage: statement!.payablePercentage === null ? null : Number(statement!.payablePercentage), label: indicator.label };
  }

  listPayrollStatements(month?: string) {
    return this.db.select().from(payrollStatements).where(month ? eq(payrollStatements.month, month) : undefined).orderBy(desc(payrollStatements.createdAt));
  }

  async reviewPayrollStatement(id: string, actorId: string) {
    const [current] = await this.db.select().from(payrollStatements).where(eq(payrollStatements.id, id)).limit(1);
    if (!current) throw new NotFoundException('Payroll statement not found');
    if (current.status !== 'DRAFT') throw new BadRequestException('Only draft statements can be reviewed');
    if (current.preparedById === actorId) throw new ConflictException('A different administrator must review this statement');
    const [updated] = await this.db.update(payrollStatements).set({ status: 'REVIEWED', reviewedById: actorId, reviewedAt: new Date(), updatedAt: new Date() }).where(eq(payrollStatements.id, id)).returning();
    return updated;
  }

  async approvePayrollStatement(id: string, actorId: string) {
    const [current] = await this.db.select().from(payrollStatements).where(eq(payrollStatements.id, id)).limit(1);
    if (!current) throw new NotFoundException('Payroll statement not found');
    if (current.status !== 'REVIEWED') throw new BadRequestException('Statement must be reviewed before approval');
    if (current.preparedById === actorId) throw new ConflictException('The preparer cannot approve this statement');
    const [updated] = await this.db.update(payrollStatements).set({ status: 'APPROVED', approvedById: actorId, approvedAt: new Date(), updatedAt: new Date() }).where(eq(payrollStatements.id, id)).returning();
    return updated;
  }

  async reopenPayrollStatement(id: string, actorId: string, reason: string) {
    const [current] = await this.db.select().from(payrollStatements).where(eq(payrollStatements.id, id)).limit(1);
    if (!current) throw new NotFoundException('Payroll statement not found');
    if (current.status !== 'APPROVED') throw new BadRequestException('Only approved statements can be reopened');
    const [updated] = await this.db.update(payrollStatements).set({ status: 'DRAFT', preparedById: actorId, reviewedById: null, approvedById: null, reviewedAt: null, approvedAt: null, reopenedReason: reason, updatedAt: new Date() }).where(eq(payrollStatements.id, id)).returning();
    return updated;
  }

}

/** [start, end) covering a calendar month "YYYY-MM". */
function monthRange(month: string): { start: string; end: string } {
  const [y, m] = month.split('-').map(Number);
  if (!y || !m || m < 1 || m > 12) throw new BadRequestException('Invalid month (expected YYYY-MM)');
  const start = `${month}-01`;
  const nextY = m === 12 ? y + 1 : y;
  const nextM = m === 12 ? 1 : m + 1;
  const end = `${nextY}-${String(nextM).padStart(2, '0')}-01`;
  return { start, end };
}
