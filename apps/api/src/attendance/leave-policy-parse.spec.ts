import { describe, expect, it } from 'vitest';
import { AttendanceService } from './attendance.service';

// The parser reads text only; it needs no database or calendar.
const service = new AttendanceService(null as never, null as never, null as never);
const parse = (t: string) => service.parseLeavePolicyPdfText(t);

describe('parseLeavePolicyPdfText', () => {
  it('returns nothing for text with no leave types, instead of inventing defaults', () => {
    expect(parse('Welcome to the company handbook.\nOffice hours are 10 to 7. Please remember to bring a laptop.')).toEqual([]);
    expect(parse('')).toEqual([]);
  });

  it('does not mistake short abbreviations inside ordinary words for leave types', () => {
    // "welcome" contains el, "company" contains pl, "closed" contains cl, "slow" contains sl.
    expect(parse('We welcome 25 new hires. The company closed 3 slow quarters.')).toEqual([]);
  });

  it('reads a stated entitlement and its rules', () => {
    const [t] = parse('Casual Leave: 12 days per year, no carry forward');
    expect(t).toMatchObject({ name: 'Casual Leave', defaultBalance: 12, carryForwardPolicy: 'NO_CARRY_FORWARD', carryForwardMax: 0, entitlementUnit: 'DAYS', approvalRequired: 'MANAGER_APPROVAL' });
  });

  it('skips a leave type with no stated number rather than guessing one', () => {
    expect(parse('Sick Leave is available to all employees')).toEqual([]);
  });

  it('recognises approval wording and units', () => {
    expect(parse('Marriage Leave 5 days, prior approval required')[0]).toMatchObject({ name: 'Marriage Leave', approvalRequired: 'PRIOR_APPROVAL' });
    expect(parse('Sick Leave 8 days, no approval needed')[0]).toMatchObject({ approvalRequired: 'NO_APPROVAL' });
    expect(parse('Maternity Leave 6 months')[0]).toMatchObject({ entitlementUnit: 'MONTHS', applicableGender: 'FEMALE', defaultBalance: 6 });
    expect(parse('Paternity Leave 10 days')[0]).toMatchObject({ applicableGender: 'MALE' });
  });

  it('matches abbreviations only as upper-case whole tokens, and de-duplicates', () => {
    const out = parse('EL 15 days\nEarned Leave 15 days again\nel 99');
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ name: 'Earned Leave', defaultBalance: 15 });
  });
});
