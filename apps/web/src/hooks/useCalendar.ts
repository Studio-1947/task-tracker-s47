import { useQuery } from '@tanstack/react-query';
import type { CalendarException, CalendarSettings } from '@task-tracker/shared';
import { http } from '../lib/api';

export interface CalendarBundle {
  settings: CalendarSettings;
  exceptions: CalendarException[];
}

export function useCalendar() {
  return useQuery({
    queryKey: ['calendar'],
    queryFn: () => http.get<CalendarBundle>('/calendar'),
    staleTime: 5 * 60_000,
  });
}

/**
 * Why `yyyy-mm-dd` is not a scheduled working day under the office calendar
 * (spec §2: "Warn for weekly off or holiday deadlines"), or null if it is.
 */
export function nonWorkingReason(date: string, cal: CalendarBundle | undefined): string | null {
  if (!cal || !date) return null;
  const ex = cal.exceptions.find((e) => e.date === date);
  if (ex?.kind === 'HOLIDAY') return `a holiday (${ex.name})`;
  if (ex?.kind === 'WORKING_DAY') return null;
  const dow = new Date(`${date}T00:00:00Z`).getUTCDay();
  return cal.settings.workdays.includes(dow) ? null : 'a weekly off day';
}
