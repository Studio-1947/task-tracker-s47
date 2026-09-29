import { describe, expect, it } from 'vitest';
import { apportionMinutes, intervalsOverlap, localWorkDate, splitAcrossLocalDays } from '@task-tracker/shared';

const IST = 'Asia/Kolkata';
// 2026-10-07 23:30 IST = 18:00Z
const at = (iso: string) => new Date(iso);

describe('cross-midnight time splitting', () => {
  it('keeps a same-day session as one segment', () => {
    const segs = splitAcrossLocalDays(at('2026-10-07T04:00:00Z'), at('2026-10-07T06:00:00Z'), IST);
    expect(segs).toHaveLength(1);
    expect(segs[0].workDate).toBe('2026-10-07');
  });

  it('splits 23:30 → 00:45 IST into 30 and 45 minutes on consecutive days', () => {
    const segs = splitAcrossLocalDays(at('2026-10-07T18:00:00Z'), at('2026-10-07T19:15:00Z'), IST);
    expect(segs.map((s) => s.workDate)).toEqual(['2026-10-07', '2026-10-08']);
    expect(segs.map((s) => s.wallMs / 60000)).toEqual([30, 45]);
  });

  it('splits a session spanning two midnights into three days', () => {
    const segs = splitAcrossLocalDays(at('2026-10-07T18:00:00Z'), at('2026-10-08T18:45:00Z'), IST);
    expect(segs).toHaveLength(3);
  });

  it('uses the office timezone, not UTC, to decide the work date', () => {
    expect(localWorkDate(at('2026-10-07T20:00:00Z'), IST)).toBe('2026-10-08');
    expect(localWorkDate(at('2026-10-07T20:00:00Z'), 'UTC')).toBe('2026-10-07');
  });

  it('apportions active minutes so the parts always sum to the total', () => {
    const segs = splitAcrossLocalDays(at('2026-10-07T18:00:00Z'), at('2026-10-07T19:15:00Z'), IST);
    const parts = apportionMinutes(50, segs);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(50);
    expect(parts[0]).toBeLessThan(parts[1]);
  });
});

describe('interval overlap', () => {
  it('flags genuine overlap', () => {
    expect(intervalsOverlap(at('2026-10-07T10:00:00Z'), at('2026-10-07T11:00:00Z'), at('2026-10-07T10:30:00Z'), at('2026-10-07T11:30:00Z'))).toBe(true);
  });
  it('allows back-to-back entries', () => {
    expect(intervalsOverlap(at('2026-10-07T10:00:00Z'), at('2026-10-07T11:00:00Z'), at('2026-10-07T11:00:00Z'), at('2026-10-07T12:00:00Z'))).toBe(false);
  });
});
