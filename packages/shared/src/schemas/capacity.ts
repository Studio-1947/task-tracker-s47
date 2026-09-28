export interface MinuteInterval { start: number; end: number }

/** Union overlapping exclusions before subtraction, preventing double-counting. */
export function unionMinutes(intervals: MinuteInterval[]): number {
  const valid = intervals.filter((x) => Number.isFinite(x.start) && Number.isFinite(x.end) && x.end > x.start)
    .sort((a, b) => a.start - b.start);
  if (!valid.length) return 0;
  let total = 0;
  let start = valid[0]!.start;
  let end = valid[0]!.end;
  for (const interval of valid.slice(1)) {
    if (interval.start <= end) end = Math.max(end, interval.end);
    else { total += end - start; start = interval.start; end = interval.end; }
  }
  return total + end - start;
}

export function calculateCapacity(scheduledMinutes: number, exclusions: MinuteInterval[], allocatedMinutes: number) {
  const excludedMinutes = Math.min(Math.max(0, scheduledMinutes), unionMinutes(exclusions));
  const availableMinutes = Math.max(0, scheduledMinutes - excludedMinutes);
  const overloadMinutes = Math.max(0, allocatedMinutes - availableMinutes);
  return {
    scheduledMinutes,
    excludedMinutes,
    availableMinutes,
    allocatedMinutes,
    overloadMinutes,
    utilisationPercent: availableMinutes === 0 ? null : (allocatedMinutes / availableMinutes) * 100,
    availabilityLabel: availableMinutes === 0 ? 'No available capacity' : null,
  };
}

export function calculatePayableIndicator(scheduledMinutes: number, workedMinutes: number, approvedPaidLeaveMinutes: number) {
  if (scheduledMinutes <= 0) return { payableMinutes: 0, percentage: null, label: 'Not applicable' };
  const payableMinutes = Math.min(scheduledMinutes, Math.max(0, workedMinutes) + Math.max(0, approvedPaidLeaveMinutes));
  return { payableMinutes, percentage: (payableMinutes / scheduledMinutes) * 100, label: null };
}

export function personMinutes(entries: Array<{ durationMinutes: number }>): number {
  return entries.reduce((sum, entry) => sum + Math.max(0, entry.durationMinutes), 0);
}
