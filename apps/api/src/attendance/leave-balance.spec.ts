import { describe, expect, it } from 'vitest';
import { computeLeaveBalance, staffingBreaches, type LeaveBalanceRules } from '@task-tracker/shared';

const accruing: LeaveBalanceRules = { annualAllotment: 0, accrualPerMonth: 1.5, carryForwardMax: 6, carryForwardExpiryMonths: 3 };
const fixed: LeaveBalanceRules = { annualAllotment: 12, accrualPerMonth: 0, carryForwardMax: 0, carryForwardExpiryMonths: null };

describe('leave accrual', () => {
  it('credits monthly on the 1st, from the joining month', () => {
    const b = computeLeaveBalance(accruing, '2026-01-01', '2026-03-15', []);
    expect(b.accrued).toBe(4.5); // Jan, Feb, Mar
    expect(b.nextAccrualOn).toBe('2026-04-01');
  });

  it('starts accruing in the joining month for a mid-year joiner', () => {
    const b = computeLeaveBalance(accruing, '2026-06-20', '2026-08-01', []);
    expect(b.accrued).toBe(4.5); // Jun, Jul, Aug
  });

  it('gives a fixed grant in full regardless of month', () => {
    const b = computeLeaveBalance(fixed, '2020-01-01', '2026-02-01', []);
    expect(b.accrued).toBe(12);
    expect(b.nextAccrualOn).toBeNull();
  });

  it('subtracts approved leave from the remaining balance', () => {
    const b = computeLeaveBalance(fixed, '2020-01-01', '2026-05-01', [{ startDate: '2026-02-03', days: 2.5 }]);
    expect(b.used).toBe(2.5);
    expect(b.remaining).toBe(9.5);
  });

  it('lets remaining go negative when over-drawn so it is visible', () => {
    const b = computeLeaveBalance(accruing, '2026-01-01', '2026-01-10', [{ startDate: '2026-01-05', days: 3 }]);
    expect(b.remaining).toBe(-1.5);
  });
});

describe('carry-forward and expiry', () => {
  // 2025: joined Jan, accrued 18, took 4 => closing 14, capped to 6.
  it('carries forward up to the cap', () => {
    const b = computeLeaveBalance(accruing, '2025-01-01', '2026-01-15', [{ startDate: '2025-05-05', days: 4 }]);
    expect(b.carriedForward).toBe(6);
    expect(b.accrued).toBe(1.5);
    expect(b.remaining).toBe(7.5);
  });

  it('carries only what is left when under the cap', () => {
    const b = computeLeaveBalance(accruing, '2025-01-01', '2026-01-15', [{ startDate: '2025-05-05', days: 16 }]);
    expect(b.carriedForward).toBe(2);
  });

  it('never carries a negative balance', () => {
    const b = computeLeaveBalance(accruing, '2025-01-01', '2026-01-15', [{ startDate: '2025-05-05', days: 30 }]);
    expect(b.carriedForward).toBe(0);
  });

  it('lapses unused carried days once the expiry month arrives', () => {
    const before = computeLeaveBalance(accruing, '2025-01-01', '2026-03-31', [{ startDate: '2025-05-05', days: 4 }]);
    const after = computeLeaveBalance(accruing, '2025-01-01', '2026-04-01', [{ startDate: '2025-05-05', days: 4 }]);
    expect(before.expired).toBe(0);
    expect(after.expired).toBe(6);
    expect(after.remaining).toBe(before.remaining - 6 + 1.5); // April accrual arrives too
    expect(before.carryForwardExpiresOn).toBe('2026-04-01');
  });

  it('uses carried days first, so leave taken before expiry protects them', () => {
    const b = computeLeaveBalance(accruing, '2025-01-01', '2026-06-01', [
      { startDate: '2025-05-05', days: 4 },
      { startDate: '2026-02-10', days: 6 },
    ]);
    expect(b.expired).toBe(0);
    expect(b.remaining).toBe(9 + 6 - 6); // accrued Jan-Jun 9 + carried 6 - used 6
  });

  it('only partly lapses when some carried days were used in time', () => {
    const b = computeLeaveBalance(accruing, '2025-01-01', '2026-06-01', [
      { startDate: '2025-05-05', days: 4 },
      { startDate: '2026-02-10', days: 2 },
    ]);
    expect(b.expired).toBe(4);
  });

  it('never expires when no expiry is configured', () => {
    const rules = { ...accruing, carryForwardExpiryMonths: null };
    const b = computeLeaveBalance(rules, '2025-01-01', '2026-11-01', [{ startDate: '2025-05-05', days: 4 }]);
    expect(b.expired).toBe(0);
    expect(b.carriedForward).toBe(6);
  });

  it('compounds correctly across several years', () => {
    // 2024: 18 accrued, 0 used -> capped 6 into 2025. 2025: 18+6 -> expired 6 (none used before April), used 10 => closing 8 -> capped 6.
    const b = computeLeaveBalance(accruing, '2024-01-01', '2026-01-02', [{ startDate: '2025-08-01', days: 10 }]);
    expect(b.carriedForward).toBe(6);
  });
});

describe('staffing clashes', () => {
  const days = [{ date: '2026-10-05', onLeave: 1, members: 4 }, { date: '2026-10-06', onLeave: 2, members: 4 }];
  it('is disabled at 100 percent', () => expect(staffingBreaches(days, 100)).toEqual([]));
  it('flags days where adding this person exceeds the limit', () => {
    const r = staffingBreaches(days, 50);
    expect(r.map((d) => d.date)).toEqual(['2026-10-06']); // (2+1)/4 = 75% > 50%; (1+1)/4 = 50% is ok
    expect(r[0]!.percentAway).toBe(75);
  });
  it('ignores empty teams', () => expect(staffingBreaches([{ date: '2026-10-05', onLeave: 0, members: 0 }], 10)).toEqual([]));
});
