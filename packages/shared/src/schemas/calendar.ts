import { z } from 'zod';

export const calendarSettingsSchema = z.object({
  timezone: z.string().min(1).max(80).default('Asia/Kolkata'),
  workdays: z.array(z.number().int().min(0).max(6)).min(1).max(7).default([1, 2, 3, 4, 5]),
  startMinute: z.number().int().min(0).max(1439).default(600),
  endMinute: z.number().int().min(1).max(1440).default(1140),
  unpaidBreakMinutes: z.number().int().min(0).max(600).default(60),
  effectiveFrom: z.string().date(),
}).refine((v) => v.endMinute > v.startMinute + v.unpaidBreakMinutes, { message: 'Schedule must contain positive working time' });
export type CalendarSettingsInput = z.infer<typeof calendarSettingsSchema>;

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
