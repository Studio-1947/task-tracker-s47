import { describe, expect, it } from 'vitest';
import { workingDayUnits, workingMinutesElapsed, type WorkingCalendarSettings } from '@task-tracker/shared';

describe('working calendar calculations', () => {
  const weekdays = [1, 2, 3, 4, 5];
  it('counts Friday through Monday as two leave days', () => expect(workingDayUnits('2026-10-02', '2026-10-05', weekdays, [])).toBe(2));
  it('gives weekends zero standard capacity', () => expect(workingDayUnits('2026-10-03', '2026-10-04', weekdays, [])).toBe(0));
  it('removes holidays and supports half-days', () => expect(workingDayUnits('2026-10-05', '2026-10-07', weekdays, [{ date: '2026-10-06', kind: 'HOLIDAY' }, { date: '2026-10-07', kind: 'HALF_DAY' }])).toBe(1.5));
  it('allows an approved exceptional weekend workday', () => expect(workingDayUnits('2026-10-03', '2026-10-03', weekdays, [{ date: '2026-10-03', kind: 'WORKING_DAY' }])).toBe(1));
  it('caps a half-day request at half a working day', () => expect(workingDayUnits('2026-10-05', '2026-10-05', weekdays, [], true)).toBe(0.5));
});

describe('working-time ageing (AT03, AT05)', () => {
  // Default office schedule: Asia/Kolkata, Mon-Fri, 10:00-19:00 (600-1140 minutes).
  const settings: WorkingCalendarSettings = { timezone: 'Asia/Kolkata', workdays: [1, 2, 3, 4, 5], startMinute: 600, endMinute: 1140 };

  it('Friday close to Monday opening is zero scheduled working time (AT03)', () => {
    // 2026-10-02 is a Friday, 2026-10-05 is the following Monday (IST).
    const fridayClose = '2026-10-02T13:30:00.000Z'; // 19:00 IST
    const mondayOpen = '2026-10-05T04:30:00.000Z'; // 10:00 IST
    expect(workingMinutesElapsed(fridayClose, mondayOpen, settings, [])).toBe(0);
  });

  it('a due date preserves its Friday commitment: minutes overdue accrue only during scheduled hours', () => {
    // Due Friday 19:00 IST; "now" is Monday 10:05 IST — 5 minutes into the next working window.
    const due = '2026-10-02T13:30:00.000Z';
    const now = '2026-10-05T04:35:00.000Z';
    expect(workingMinutesElapsed(due, now, settings, [])).toBe(5);
  });

  it('shows less than one working day overdue for a task just past its cutoff (AT05)', () => {
    // Due Wednesday 15:00 IST; "now" is the same Wednesday 16:00 IST — one hour later, same working day.
    const due = '2026-10-07T09:30:00.000Z'; // 15:00 IST
    const now = '2026-10-07T10:30:00.000Z'; // 16:00 IST
    expect(workingMinutesElapsed(due, now, settings, [])).toBe(60);
  });

  it('a holiday between due date and now contributes zero minutes', () => {
    // Due Friday 2026-10-02 19:00 IST; now Tuesday 2026-10-06 10:00 IST; Monday 2026-10-05 declared a holiday.
    const due = '2026-10-02T13:30:00.000Z';
    const now = '2026-10-06T04:30:00.000Z';
    const withoutHoliday = workingMinutesElapsed(due, now, settings, []);
    const withHoliday = workingMinutesElapsed(due, now, settings, [{ date: '2026-10-05', kind: 'HOLIDAY', workingMinutes: null }]);
    expect(withHoliday).toBeLessThan(withoutHoliday);
  });

  it('returns zero when the due date has not passed yet', () => {
    expect(workingMinutesElapsed('2026-10-07T10:30:00.000Z', '2026-10-07T09:30:00.000Z', settings, [])).toBe(0);
  });
});
