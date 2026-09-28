import { describe, expect, it } from 'vitest';
import { calculateCapacity, calculatePayableIndicator, personMinutes, unionMinutes } from '@task-tracker/shared';

describe('capacity and payable acceptance calculations', () => {
  it('AT07 counts concurrent work as person-minutes', () => {
    expect(personMinutes([{ durationMinutes: 60 }, { durationMinutes: 60 }])).toBe(120);
  });
  it('AT14 calculates 27 hours available and 3 hours overload', () => {
    const result = calculateCapacity(40 * 60, [{ start: 0, end: 8 * 60 }, { start: 8 * 60, end: 13 * 60 }], 30 * 60);
    expect(result.availableMinutes).toBe(27 * 60);
    expect(result.overloadMinutes).toBe(3 * 60);
    expect(result.utilisationPercent).toBeCloseTo(111.111, 2);
  });
  it('AT15 subtracts overlapping exclusions once', () => {
    expect(unionMinutes([{ start: 60, end: 180 }, { start: 120, end: 240 }])).toBe(180);
  });
  it('AT16 returns not applicable for a zero denominator', () => {
    expect(calculateCapacity(0, [], 0).utilisationPercent).toBeNull();
    expect(calculatePayableIndicator(0, 0, 0)).toMatchObject({ percentage: null, label: 'Not applicable' });
  });
  it('calculates the specification payable illustration without making it salary', () => {
    expect(calculatePayableIndicator(160 * 60, 144 * 60, 8 * 60).percentage).toBe(95);
  });
});
