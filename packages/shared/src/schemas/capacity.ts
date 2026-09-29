import { z } from 'zod';

export interface MinuteInterval { start: number; end: number }

/**
 * Persisted per-person planning allocation for a period (PRD §7: "Allocate
 * remaining effort across the days or weeks when work is planned" and "split
 * each task's remaining effort among contributors" — not the whole estimate
 * to every tagged person).
 */
export const capacityAllocationSchema = z.object({
  userId: z.string().uuid(),
  taskId: z.string().uuid().nullable().optional(),
  periodStart: z.string().date(),
  periodEnd: z.string().date(),
  allocatedMinutes: z.number().int().min(1).max(100_000),
}).refine((v) => v.periodEnd >= v.periodStart, { message: 'Period end must be on or after the start', path: ['periodEnd'] });
export type CapacityAllocationInput = z.infer<typeof capacityAllocationSchema>;

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

/**
 * Time a person has set aside that is not available for planned task work
 * (meetings, training, …). Only its overlap with scheduled working hours
 * reduces capacity, and overlapping reservations are never double-counted.
 */
export const reservedTimeSchema = z.object({
  userId: z.string().uuid().optional(),
  kind: z.enum(['MEETING', 'TRAINING', 'OTHER']).default('MEETING'),
  title: z.string().trim().min(1).max(200),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
}).refine((v) => v.endsAt > v.startsAt, { message: 'End must be after the start', path: ['endsAt'] })
  .refine((v) => new Date(v.endsAt).getTime() - new Date(v.startsAt).getTime() <= 7 * 86400000, { message: 'A reservation cannot exceed 7 days', path: ['endsAt'] });
export type ReservedTimeInput = z.infer<typeof reservedTimeSchema>;

export interface UnallocatedWorkItem {
  taskId: string;
  ref: string;
  title: string;
  workspaceId: string;
  remainingMinutes: number;
  allocatedMinutes: number;
  /** Remaining effort no one has been planned against yet. */
  unallocatedMinutes: number;
  assigneeCount: number;
  dueDate: string | null;
}
