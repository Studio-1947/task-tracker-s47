/**
 * Leave balance rules: monthly accrual, year-end carry-forward with a cap, and
 * expiry of carried-forward days. Pure and deterministic so the same answer is
 * given wherever it is asked (balance screen, approval check, reports) — there
 * is no scheduled job that has to have run for the number to be right.
 *
 * Leave year = calendar year. Accrual is credited on the 1st of each month,
 * starting with the month the person joined. Leave taken is attributed to the
 * year of its start date. Carried-forward days are consumed first; whatever is
 * still unused when the expiry month passes lapses.
 */
export interface LeaveBalanceRules {
  /** Whole-year allotment, used when `accrualPerMonth` is 0 (a fixed grant). */
  annualAllotment: number;
  /** Days credited each month; 0 means the type uses the fixed annual allotment. */
  accrualPerMonth: number;
  /** Most days that may roll into the next year. */
  carryForwardMax: number;
  /** Carried-forward days lapse this many months into the year (null = never). */
  carryForwardExpiryMonths: number | null;
}

export interface LeaveTaken {
  startDate: string;
  days: number;
}

export interface LeaveBalanceResult {
  year: number;
  /** Days granted this leave year up to `asOf` (accrual so far, or the fixed grant). */
  accrued: number;
  /** Days brought in from the previous year (after the cap). */
  carriedForward: number;
  /** Carried-forward days that lapsed unused. */
  expired: number;
  used: number;
  remaining: number;
  /** First day of the next month when more accrues, or null for fixed grants. */
  nextAccrualOn: string | null;
  /** Date the carried-forward days lapse this year, or null if they do not. */
  carryForwardExpiresOn: string | null;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

function parts(date: string): { y: number; m0: number } {
  return { y: Number(date.slice(0, 4)), m0: Number(date.slice(5, 7)) - 1 };
}

function expiryDate(year: number, months: number | null): string | null {
  if (months === null) return null;
  const total = months; // months after 1 January
  const y = year + Math.floor(total / 12);
  const m = (total % 12) + 1;
  return `${y}-${String(m).padStart(2, '0')}-01`;
}

export function computeLeaveBalance(rules: LeaveBalanceRules, joinedOn: string, asOf: string, taken: LeaveTaken[]): LeaveBalanceResult {
  const join = parts(joinedOn);
  const now = parts(asOf);
  const firstYear = Math.min(join.y, now.y);
  let closingPrev = 0;
  let result: LeaveBalanceResult | null = null;

  for (let y = firstYear; y <= now.y; y += 1) {
    const joinOffset = y === join.y ? join.m0 : 0;
    const monthsFull = y < join.y ? 0 : 12 - joinOffset;
    const accruedFull = rules.accrualPerMonth > 0 ? rules.accrualPerMonth * monthsFull : y < join.y ? 0 : rules.annualAllotment;
    const carried = y === firstYear ? 0 : round2(Math.min(rules.carryForwardMax, Math.max(0, closingPrev)));
    const inYear = taken.filter((t) => t.startDate.startsWith(`${y}-`));
    const usedY = inYear.reduce((s, t) => s + t.days, 0);
    const expiresOn = expiryDate(y, rules.carryForwardExpiryMonths);
    const usedBeforeExpiry = expiresOn ? inYear.filter((t) => t.startDate < expiresOn).reduce((s, t) => s + t.days, 0) : usedY;
    const expiredIfLapsed = expiresOn ? Math.max(0, carried - usedBeforeExpiry) : 0;

    if (y < now.y) {
      closingPrev = accruedFull + carried - expiredIfLapsed - usedY;
      continue;
    }

    const monthsSoFar = Math.max(0, now.m0 + 1 - joinOffset);
    const accrued = rules.accrualPerMonth > 0 ? rules.accrualPerMonth * monthsSoFar : accruedFull;
    const lapsed = expiresOn !== null && asOf >= expiresOn ? expiredIfLapsed : 0;
    const nextMonth = now.m0 === 11 ? `${y + 1}-01-01` : `${y}-${String(now.m0 + 2).padStart(2, '0')}-01`;
    result = {
      year: y,
      accrued: round2(accrued),
      carriedForward: carried,
      expired: round2(lapsed),
      used: round2(usedY),
      remaining: round2(accrued + carried - lapsed - usedY),
      nextAccrualOn: rules.accrualPerMonth > 0 ? nextMonth : null,
      carryForwardExpiresOn: carried > 0 ? expiresOn : null,
    };
  }
  return result!;
}

export interface StaffingDayLoad {
  date: string;
  onLeave: number;
  members: number;
}

/**
 * A day breaches the staffing rule when adding one more person on leave would
 * put more than `maxPercent` of the team away. `maxPercent` 100 disables it.
 */
export function staffingBreaches(days: StaffingDayLoad[], maxPercent: number): Array<StaffingDayLoad & { percentAway: number }> {
  if (maxPercent >= 100) return [];
  return days
    .filter((d) => d.members > 0)
    .map((d) => ({ ...d, percentAway: round2(((d.onLeave + 1) / d.members) * 100) }))
    .filter((d) => d.percentAway > maxPercent);
}
