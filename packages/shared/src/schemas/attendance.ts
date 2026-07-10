import { z } from 'zod';

const hexColor = z.string().regex(/^#([0-9a-fA-F]{6})$/, 'Must be a hex color like #4f46e5');

/* ── Leave types (admin-managed) ── */
export const createLeaveTypeSchema = z.object({
  name: z.string().min(1).max(60),
  color: hexColor.optional(),
  defaultBalance: z.number().int().min(0).max(365).default(0),
});
export type CreateLeaveTypeInput = z.infer<typeof createLeaveTypeSchema>;

export const updateLeaveTypeSchema = z
  .object({
    name: z.string().min(1).max(60).optional(),
    color: hexColor.nullable().optional(),
    defaultBalance: z.number().int().min(0).max(365).optional(),
    isActive: z.boolean().optional(),
  })
  .strict();
export type UpdateLeaveTypeInput = z.infer<typeof updateLeaveTypeSchema>;

/* ── Per-user leave allotment override ── */
export const setLeaveBalancesSchema = z
  .object({
    balances: z
      .array(
        z.object({
          leaveTypeId: z.string().uuid(),
          allotted: z.number().int().min(0).max(365),
        }),
      )
      .max(50),
  })
  .strict();
export type SetLeaveBalancesInput = z.infer<typeof setLeaveBalancesSchema>;

/* ── Leave requests ── */
export const createLeaveRequestSchema = z
  .object({
    leaveTypeId: z.string().uuid(),
    startDate: z.string().date(),
    endDate: z.string().date(),
    halfDay: z.boolean().default(false),
    reason: z.string().max(1000).optional(),
  })
  .refine((v) => v.endDate >= v.startDate, {
    message: 'End date must be on or after start date',
    path: ['endDate'],
  })
  .refine((v) => !v.halfDay || v.startDate === v.endDate, {
    message: 'A half-day leave must be a single day',
    path: ['halfDay'],
  });
export type CreateLeaveRequestInput = z.infer<typeof createLeaveRequestSchema>;

export const reviewLeaveRequestSchema = z
  .object({
    status: z.enum(['APPROVED', 'DECLINED']),
    note: z.string().max(1000).optional(),
  })
  .strict();
export type ReviewLeaveRequestInput = z.infer<typeof reviewLeaveRequestSchema>;

/* ── Attendance check-in / check-out ── */
const geoPunchSchema = z.object({
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  accuracy: z.number().min(0).optional(),
});
export const attendancePunchSchema = geoPunchSchema.strict();
export type AttendancePunchInput = z.infer<typeof attendancePunchSchema>;
