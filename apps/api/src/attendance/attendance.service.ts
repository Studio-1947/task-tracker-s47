import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, desc, eq, gte, inArray, lt, lte, sum, type SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type {
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
  UpdateLeaveTypeInput,
} from '@task-tracker/shared';
import { DRIZZLE, type Database } from '../database/database.module';
import {
  attendanceRecords,
  leaveBalances,
  leaveRequests,
  leaveTypes,
  users,
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

/** Inclusive calendar-day count (0.5 for a half-day). */
function computeDays(start: string, end: string, halfDay: boolean): number {
  if (halfDay) return 0.5;
  const s = Date.parse(`${start}T00:00:00Z`);
  const e = Date.parse(`${end}T00:00:00Z`);
  return Math.round((e - s) / 86_400_000) + 1;
}

@Injectable()
export class AttendanceService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  /* ── mappers ── */
  private toLeaveType(t: LeaveTypeRow): LeaveType {
    return {
      id: t.id,
      name: t.name,
      color: t.color,
      defaultBalance: t.defaultBalance,
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
      .values({ name: input.name, color: input.color ?? null, defaultBalance: input.defaultBalance })
      .returning();
    return this.toLeaveType(t!);
  }

  async updateLeaveType(id: string, input: UpdateLeaveTypeInput): Promise<LeaveType> {
    const [t] = await this.db
      .update(leaveTypes)
      .set({ ...input, updatedAt: new Date() })
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

    const days = computeDays(input.startDate, input.endDate, input.halfDay);
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
    return item!;
  }

  myLeaves(userId: string): Promise<LeaveRequestItem[]> {
    return this.leaveQuery(eq(leaveRequests.userId, userId));
  }

  listLeaves(status?: string): Promise<LeaveRequestItem[]> {
    return this.leaveQuery(status ? eq(leaveRequests.status, status) : undefined);
  }

  async reviewLeave(id: string, reviewerId: string, input: ReviewLeaveRequestInput): Promise<LeaveRequestItem> {
    const [current] = await this.db
      .select({ status: leaveRequests.status })
      .from(leaveRequests)
      .where(eq(leaveRequests.id, id))
      .limit(1);
    if (!current) throw new NotFoundException('Leave request not found');
    if (current.status !== 'PENDING') throw new BadRequestException('This request has already been reviewed');

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
  async balancesFor(userId: string): Promise<LeaveBalance[]> {
    const [types, overrides, used] = await Promise.all([
      this.db.select().from(leaveTypes).where(eq(leaveTypes.isActive, true)).orderBy(leaveTypes.name),
      this.db.select().from(leaveBalances).where(eq(leaveBalances.userId, userId)),
      this.db
        .select({ leaveTypeId: leaveRequests.leaveTypeId, used: sum(leaveRequests.days) })
        .from(leaveRequests)
        .where(and(eq(leaveRequests.userId, userId), eq(leaveRequests.status, 'APPROVED')))
        .groupBy(leaveRequests.leaveTypeId),
    ]);
    const overrideBy = new Map(overrides.map((o) => [o.leaveTypeId, o.allotted]));
    const usedBy = new Map(used.map((u) => [u.leaveTypeId, Number(u.used ?? 0)]));
    return types.map((t) => {
      const allotted = overrideBy.get(t.id) ?? t.defaultBalance;
      const usedDays = usedBy.get(t.id) ?? 0;
      return {
        leaveTypeId: t.id,
        typeName: t.name,
        color: t.color,
        allotted,
        used: usedDays,
        remaining: allotted - usedDays,
      };
    });
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
