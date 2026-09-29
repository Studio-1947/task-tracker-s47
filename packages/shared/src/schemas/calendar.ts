import { z } from 'zod';

const calendarSettingsBaseSchema = z.object({
  timezone: z.string().min(1).max(80).default('Asia/Kolkata'),
  workdays: z.array(z.number().int().min(0).max(6)).min(1).max(7).default([1, 2, 3, 4, 5]),
  startMinute: z.number().int().min(0).max(1439).default(600),
  endMinute: z.number().int().min(1).max(1440).default(1140),
  unpaidBreakMinutes: z.number().int().min(0).max(600).default(60),
  effectiveFrom: z.string().date(),
});
export const calendarSettingsSchema = calendarSettingsBaseSchema.refine((v) => v.endMinute > v.startMinute + v.unpaidBreakMinutes, { message: 'Schedule must contain positive working time' });
export type CalendarSettingsInput = z.infer<typeof calendarSettingsSchema>;

export const updateCalendarSettingsSchema = calendarSettingsBaseSchema.and(z.object({
  changeReason: z.string().trim().min(1).max(2000),
})).refine((v) => v.endMinute > v.startMinute + v.unpaidBreakMinutes, { message: 'Schedule must contain positive working time' });
export type UpdateCalendarSettingsInput = z.infer<typeof updateCalendarSettingsSchema>;

export const scheduleGroupSchema = calendarSettingsBaseSchema.omit({ effectiveFrom: true }).and(z.object({
  name: z.string().trim().min(1).max(120),
  effectiveFrom: z.string().date(),
  effectiveTo: z.string().date().nullable().optional(),
})).refine((v) => !v.effectiveTo || v.effectiveTo >= v.effectiveFrom, { message: 'Effective end must be on or after the start', path: ['effectiveTo'] });
export type ScheduleGroupInput = z.infer<typeof scheduleGroupSchema>;

/** Assigns a person to a schedule group for an effective-dated span (PRD §2 "by employee or schedule group"). */
export const scheduleGroupAssignmentSchema = z.object({
  userId: z.string().uuid(),
  effectiveFrom: z.string().date(),
  effectiveTo: z.string().date().nullable().optional(),
}).refine((v) => !v.effectiveTo || v.effectiveTo >= v.effectiveFrom, { message: 'Effective end must be on or after the start', path: ['effectiveTo'] });
export type ScheduleGroupAssignmentInput = z.infer<typeof scheduleGroupAssignmentSchema>;

export const calendarExceptionSchema = z.object({
  date: z.string().date(),
  name: z.string().trim().min(1).max(120),
  kind: z.enum(['HOLIDAY', 'HALF_DAY', 'WORKING_DAY']),
  workingMinutes: z.number().int().min(1).max(1440).nullable().optional(),
});
export type CalendarExceptionInput = z.infer<typeof calendarExceptionSchema>;

export interface CalendarSettings extends CalendarSettingsInput { id: number; updatedAt: string }
export interface CalendarException extends CalendarExceptionInput { id: string; createdAt: string }

export function dateRange(start: string, end: string): string[] {
  const result: string[] = [];
  for (let d = new Date(`${start}T00:00:00Z`); d <= new Date(`${end}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 1)) result.push(d.toISOString().slice(0, 10));
  return result;
}

export function workingDayUnits(start: string, end: string, workdays: number[], exceptions: Pick<CalendarExceptionInput, 'date' | 'kind'>[], halfDay = false): number {
  const byDate = new Map(exceptions.map((e) => [e.date, e.kind]));
  const units = dateRange(start, end).reduce((sum, day) => {
    const kind = byDate.get(day);
    if (kind === 'HOLIDAY') return sum;
    if (kind === 'HALF_DAY') return sum + 0.5;
    if (kind === 'WORKING_DAY') return sum + 1;
    return sum + (workdays.includes(new Date(`${day}T00:00:00Z`).getUTCDay()) ? 1 : 0);
  }, 0);
  return halfDay ? Math.min(units, 0.5) : units;
}

export interface WorkingCalendarSettings {
  timezone: string;
  workdays: number[];
  startMinute: number;
  endMinute: number;
}
export type WorkingCalendarException = Pick<CalendarExceptionInput, 'date' | 'kind' | 'workingMinutes'>;

/** Local-calendar wall-clock date/time parts for an instant, in the given IANA timezone. */
function zonedParts(instant: Date, timezone: string): { y: number; m: number; d: number; minuteOfDay: number } {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const parts = Object.fromEntries(fmt.formatToParts(instant).map((p) => [p.type, p.value]));
  const y = Number(parts.year);
  const m = Number(parts.month);
  const d = Number(parts.day);
  // Some locales render midnight as "24:00" with hour12: false.
  const hour = Number(parts.hour) % 24;
  const minute = Number(parts.minute);
  return { y, m, d, minuteOfDay: hour * 60 + minute };
}

function dayKey(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/**
 * Scheduled working minutes strictly between two instants, honouring the
 * office timezone, weekly workdays and calendar exceptions — the ageing basis
 * behind "a Friday deadline stays a Friday deadline; skipping weekend hours
 * must not silently move it to Monday" (PRD §2). Returns 0 when `to` is not
 * after `from`. DST is not modelled (fine for a fixed-offset zone such as the
 * default Asia/Kolkata; a zone with DST may be off by up to an hour around a
 * transition day).
 */
export function workingMinutesElapsed(
  fromIso: string,
  toIso: string,
  settings: WorkingCalendarSettings,
  exceptions: WorkingCalendarException[],
): number {
  const from = new Date(fromIso);
  const to = new Date(toIso);
  if (!(from.getTime() < to.getTime())) return 0;

  const byDate = new Map(exceptions.map((e) => [e.date, e]));
  const fromParts = zonedParts(from, settings.timezone);
  const fromDayKey = dayKey(fromParts.y, fromParts.m, fromParts.d);
  const toParts = zonedParts(to, settings.timezone);
  const toDayKey = dayKey(toParts.y, toParts.m, toParts.d);

  let total = 0;
  let cursor = from;
  // One iteration per calendar day touched by the interval; capped well above
  // any realistic overdue span (~13 years) as a defensive guard against a bug
  // that would otherwise spin forever.
  for (let guard = 0; guard < 5000; guard += 1) {
    const parts = zonedParts(cursor, settings.timezone);
    const key = dayKey(parts.y, parts.m, parts.d);
    const exception = byDate.get(key);
    const isHoliday = exception?.kind === 'HOLIDAY';
    const isForcedWorkday = exception?.kind === 'WORKING_DAY';
    const weekday = new Date(Date.UTC(parts.y, parts.m - 1, parts.d)).getUTCDay();
    const isStandardWorkday = settings.workdays.includes(weekday);

    if (!isHoliday && (isForcedWorkday || isStandardWorkday)) {
      let dayEndMinute = settings.endMinute;
      if (exception?.kind === 'HALF_DAY') {
        const half = exception.workingMinutes ?? Math.round((settings.endMinute - settings.startMinute) / 2);
        dayEndMinute = Math.min(dayEndMinute, settings.startMinute + half);
      }
      const windowStart = key === fromDayKey ? Math.max(settings.startMinute, fromParts.minuteOfDay) : settings.startMinute;
      const windowEnd = key === toDayKey ? Math.min(dayEndMinute, toParts.minuteOfDay) : dayEndMinute;
      total += Math.max(0, windowEnd - windowStart);
    }

    if (key === toDayKey) break;
    cursor = new Date(cursor.getTime() + 24 * 60 * 60 * 1000);
  }
  return total;
}

/** The office-local calendar date (YYYY-MM-DD) an instant falls on. */
export function localWorkDate(instant: Date, timezone: string): string {
  const p = zonedParts(instant, timezone);
  return dayKey(p.y, p.m, p.d);
}

export interface TimeSegment {
  workDate: string;
  startedAt: Date;
  endedAt: Date;
  /** Wall-clock milliseconds inside this local day. */
  wallMs: number;
}

/**
 * Splits a worked interval at every office-local midnight so a session that
 * runs 23:30 → 00:45 books 30 minutes to one day and 45 to the next, rather
 * than the whole span landing on the start date (PRD time-entry rules).
 */
export function splitAcrossLocalDays(startedAt: Date, endedAt: Date, timezone: string): TimeSegment[] {
  const segments: TimeSegment[] = [];
  let cursor = startedAt;
  while (cursor.getTime() < endedAt.getTime()) {
    const { minuteOfDay } = zonedParts(cursor, timezone);
    const subMinuteMs = (cursor.getTime() % 60000 + 60000) % 60000;
    let next = new Date(cursor.getTime() - subMinuteMs + (1440 - minuteOfDay) * 60000);
    // DST days are not 1440 minutes long: nudge until we land exactly on local 00:00.
    for (let i = 0; i < 3; i += 1) {
      const mod = zonedParts(next, timezone).minuteOfDay;
      if (mod === 0) break;
      next = new Date(next.getTime() + (mod < 720 ? -mod : 1440 - mod) * 60000);
    }
    if (next.getTime() <= cursor.getTime()) next = new Date(cursor.getTime() + 60000);
    const end = next.getTime() < endedAt.getTime() ? next : endedAt;
    segments.push({ workDate: localWorkDate(cursor, timezone), startedAt: cursor, endedAt: end, wallMs: end.getTime() - cursor.getTime() });
    cursor = end;
  }
  return segments;
}

/**
 * Shares `totalMinutes` of active (unpaused) effort across segments in
 * proportion to wall time, so the parts always sum exactly to the total.
 */
export function apportionMinutes(totalMinutes: number, segments: Pick<TimeSegment, 'wallMs'>[]): number[] {
  const wall = segments.reduce((sum, s) => sum + s.wallMs, 0);
  if (segments.length === 0) return [];
  if (wall <= 0) return segments.map((_, i) => (i === 0 ? totalMinutes : 0));
  let allocated = 0;
  return segments.map((s, i) => {
    if (i === segments.length - 1) return totalMinutes - allocated;
    const share = Math.round((totalMinutes * s.wallMs) / wall);
    allocated += share;
    return share;
  });
}

/** Half-open interval overlap: back-to-back entries (one ends when the next starts) do not clash. */
export function intervalsOverlap(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart.getTime() < bEnd.getTime() && bStart.getTime() < aEnd.getTime();
}

/** The instant at which the office-local calendar day `date` (YYYY-MM-DD) begins. */
export function localMidnight(date: string, timezone: string): Date {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const utcMidnight = Date.UTC(y, m - 1, d);
  const p = zonedParts(new Date(utcMidnight), timezone);
  const dayDiff = Math.round((Date.UTC(p.y, p.m - 1, p.d) - utcMidnight) / 86400000);
  return new Date(utcMidnight - (dayDiff * 1440 + p.minuteOfDay) * 60000);
}

/** Merges overlapping/adjacent [start,end) epoch-ms intervals so nothing is counted twice. */
export function mergeIntervals(intervals: Array<{ start: number; end: number }>): Array<{ start: number; end: number }> {
  const sorted = intervals.filter((i) => i.end > i.start).sort((a, b) => a.start - b.start);
  const out: Array<{ start: number; end: number }> = [];
  for (const i of sorted) {
    const last = out[out.length - 1];
    if (last && i.start <= last.end) last.end = Math.max(last.end, i.end);
    else out.push({ ...i });
  }
  return out;
}

/**
 * Working minutes between two instants with non-actionable periods (leave,
 * blocked, awaiting review) taken out. Overlapping periods are merged first so
 * a blocked day that is also a leave day is only excluded once.
 */
export function eligibleWorkingMinutes(
  from: Date,
  to: Date,
  settings: WorkingCalendarSettings,
  exceptions: WorkingCalendarException[],
  nonActionable: Array<{ start: number; end: number }>,
): number {
  if (to.getTime() <= from.getTime()) return 0;
  const total = workingMinutesElapsed(from.toISOString(), to.toISOString(), settings, exceptions);
  const clipped = nonActionable.map((i) => ({ start: Math.max(i.start, from.getTime()), end: Math.min(i.end, to.getTime()) }));
  const excluded = mergeIntervals(clipped).reduce(
    (sum, i) => sum + workingMinutesElapsed(new Date(i.start).toISOString(), new Date(i.end).toISOString(), settings, exceptions),
    0,
  );
  return Math.max(0, total - excluded);
}
