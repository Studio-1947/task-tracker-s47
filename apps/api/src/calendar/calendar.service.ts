import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, eq, gte, lte } from 'drizzle-orm';
import {
  workingDayUnits,
  type CalendarExceptionInput,
  type UpdateCalendarSettingsInput,
  type ScheduleGroupInput,
  type ScheduleGroupAssignmentInput,
  type WorkingCalendarException,
} from '@task-tracker/shared';
import { DRIZZLE, type Database } from '../database/database.module';
import { calendarExceptions, calendarSettings, calendarVersions, scheduleGroupAssignments, scheduleGroups } from '../database/schema';

@Injectable()
export class CalendarService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  /** Settings row (may be undefined only if the seeded singleton was somehow deleted) plus all exceptions. */
  async get(): Promise<{
    settings: (typeof calendarSettings.$inferSelect) | undefined;
    exceptions: WorkingCalendarException[];
  }> {
    const [settings] = await this.db.select().from(calendarSettings).where(eq(calendarSettings.id, 1));
    const exceptions = await this.db.select().from(calendarExceptions).orderBy(asc(calendarExceptions.date));
    return { settings, exceptions: exceptions as WorkingCalendarException[] };
  }

  async update(input: UpdateCalendarSettingsInput) {
    const { changeReason, ...settings } = input;
    return this.db.transaction(async (tx) => {
      const [row] = await tx.insert(calendarSettings).values({ id: 1, ...settings }).onConflictDoUpdate({ target: calendarSettings.id, set: { ...settings, updatedAt: new Date() } }).returning();
      await tx.insert(calendarVersions).values({ ...settings, changeReason });
      return row;
    });
  }

  history() { return this.db.select().from(calendarVersions).orderBy(asc(calendarVersions.effectiveFrom)); }

  listScheduleGroups() { return this.db.select().from(scheduleGroups).orderBy(asc(scheduleGroups.name)); }

  async createScheduleGroup(input: ScheduleGroupInput) {
    const [row] = await this.db.insert(scheduleGroups).values({ ...input, effectiveTo: input.effectiveTo ?? null }).returning();
    return row;
  }

  async removeScheduleGroup(id: string) {
    const [row] = await this.db.delete(scheduleGroups).where(eq(scheduleGroups.id, id)).returning({ id: scheduleGroups.id });
    if (!row) throw new NotFoundException('Schedule group not found');
    return row;
  }

  /** Per-employee schedule-group assignment for an effective-dated span (PRD §2). */
  async assignToScheduleGroup(scheduleGroupId: string, input: ScheduleGroupAssignmentInput) {
    const [group] = await this.db.select({ id: scheduleGroups.id }).from(scheduleGroups).where(eq(scheduleGroups.id, scheduleGroupId)).limit(1);
    if (!group) throw new NotFoundException('Schedule group not found');
    const [row] = await this.db
      .insert(scheduleGroupAssignments)
      .values({ scheduleGroupId, userId: input.userId, effectiveFrom: input.effectiveFrom, effectiveTo: input.effectiveTo ?? null })
      .returning();
    return row;
  }

  listAssignments(scheduleGroupId: string) {
    return this.db.select().from(scheduleGroupAssignments).where(eq(scheduleGroupAssignments.scheduleGroupId, scheduleGroupId)).orderBy(asc(scheduleGroupAssignments.effectiveFrom));
  }

  async removeAssignment(id: string) {
    const [row] = await this.db.delete(scheduleGroupAssignments).where(eq(scheduleGroupAssignments.id, id)).returning({ id: scheduleGroupAssignments.id });
    if (!row) throw new NotFoundException('Assignment not found');
    return row;
  }

  /** The schedule group effective for a person as of a given date, if any (falls back to the org default when none applies). */
  async scheduleGroupFor(userId: string, asOfDate: string) {
    // Filtered in JS: `effectiveTo` is nullable (open-ended), so the "still in range" check
    // isn't a single simple SQL `lte` without a more elaborate OR-null clause.
    const candidates = await this.db
      .select({ group: scheduleGroups, effectiveFrom: scheduleGroupAssignments.effectiveFrom, effectiveTo: scheduleGroupAssignments.effectiveTo })
      .from(scheduleGroupAssignments)
      .innerJoin(scheduleGroups, eq(scheduleGroups.id, scheduleGroupAssignments.scheduleGroupId))
      .where(and(eq(scheduleGroupAssignments.userId, userId), lte(scheduleGroupAssignments.effectiveFrom, asOfDate)));
    const match = candidates
      .filter((c) => !c.effectiveTo || c.effectiveTo >= asOfDate)
      .sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? 1 : -1))[0];
    return match?.group ?? null;
  }

  async addException(input: CalendarExceptionInput) {
    const [row] = await this.db.insert(calendarExceptions).values({ ...input, workingMinutes: input.workingMinutes ?? null }).onConflictDoUpdate({ target: calendarExceptions.date, set: { name: input.name, kind: input.kind, workingMinutes: input.workingMinutes ?? null } }).returning();
    return row;
  }

  async removeException(id: string) {
    const [row] = await this.db.delete(calendarExceptions).where(eq(calendarExceptions.id, id)).returning({ id: calendarExceptions.id });
    if (!row) throw new NotFoundException('Calendar exception not found');
    return row;
  }

  async leaveUnits(start: string, end: string, halfDay: boolean): Promise<number> {
    const [settings] = await this.db.select().from(calendarSettings).where(eq(calendarSettings.id, 1));
    const exceptions = await this.db.select({ date: calendarExceptions.date, kind: calendarExceptions.kind }).from(calendarExceptions).where(and(gte(calendarExceptions.date, start), lte(calendarExceptions.date, end)));
    return workingDayUnits(start, end, settings?.workdays ?? [1,2,3,4,5], exceptions as { date: string; kind: 'HOLIDAY' | 'HALF_DAY' | 'WORKING_DAY' }[], halfDay);
  }
}
