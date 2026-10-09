import { z } from 'zod';

const hexColor = z.string().regex(/^#([0-9a-fA-F]{6})$/, 'Must be a hex color like #4f46e5');

/* ── Leave types (admin-managed) ── */
export const createLeaveTypeSchema = z.object({
  name: z.string().min(1).max(60),
  color: hexColor.optional(),
  defaultBalance: z.number().int().min(0).max(365).default(0),
  accrualPerMonth: z.number().min(0).max(31).default(0),
  carryForwardMax: z.number().min(0).max(365).default(0),
  carryForwardExpiryMonths: z.number().int().min(1).max(24).nullable().default(null),
  carryForwardPolicy: z.enum(['LAPSE_AFTER_YEAR', 'NO_CARRY_FORWARD', 'CARRY_FORWARD']).default('LAPSE_AFTER_YEAR'),
  approvalRequired: z.enum(['MANAGER_APPROVAL', 'PRIOR_APPROVAL', 'NO_APPROVAL']).default('MANAGER_APPROVAL'),
  entitlementUnit: z.enum(['DAYS', 'MONTHS']).default('DAYS'),
  wfhEntitlementDays: z.number().int().min(0).max(365).default(0),
  policyNotes: z.string().max(1000).nullable().optional(),
  applicableGender: z.enum(['ALL', 'MALE', 'FEMALE', 'OTHER']).default('ALL'),
});
export type CreateLeaveTypeInput = z.infer<typeof createLeaveTypeSchema>;

export const updateLeaveTypeSchema = z
  .object({
    name: z.string().min(1).max(60).optional(),
    color: hexColor.nullable().optional(),
    defaultBalance: z.number().int().min(0).max(365).optional(),
    accrualPerMonth: z.number().min(0).max(31).optional(),
    carryForwardMax: z.number().min(0).max(365).optional(),
    carryForwardExpiryMonths: z.number().int().min(1).max(24).nullable().optional(),
    carryForwardPolicy: z.enum(['LAPSE_AFTER_YEAR', 'NO_CARRY_FORWARD', 'CARRY_FORWARD']).optional(),
    approvalRequired: z.enum(['MANAGER_APPROVAL', 'PRIOR_APPROVAL', 'NO_APPROVAL']).optional(),
    entitlementUnit: z.enum(['DAYS', 'MONTHS']).optional(),
    wfhEntitlementDays: z.number().int().min(0).max(365).optional(),
    policyNotes: z.string().max(1000).nullable().optional(),
    applicableGender: z.enum(['ALL', 'MALE', 'FEMALE', 'OTHER']).optional(),
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
    /** Approve despite a staffing clash; requires a note explaining why. */
    overrideStaffingClash: z.boolean().optional(),
  })
  .strict();
export type ReviewLeaveRequestInput = z.infer<typeof reviewLeaveRequestSchema>;

/* ── Attendance check-in / check-out ── */
const geoPunchSchema = z.object({
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  accuracy: z.number().min(0).optional(),
});
export const attendancePunchSchema = geoPunchSchema
  .extend({
    /** Required on check-out while a task timer is running. Attendance time never becomes task time. */
    timerAction: z.enum(['STOP', 'KEEP']).optional(),
  })
  .strict();
export type AttendancePunchInput = z.infer<typeof attendancePunchSchema>;

export const createCorrectionSchema = z
  .object({
    workDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    proposedCheckInAt: z.string().datetime(),
    proposedCheckOutAt: z.string().datetime(),
    reason: z.string().trim().min(1).max(2000),
  })
  .refine((v) => v.proposedCheckOutAt > v.proposedCheckInAt, {
    message: 'Check-out time must be after check-in time',
    path: ['proposedCheckOutAt'],
  });
export type CreateCorrectionInput = z.infer<typeof createCorrectionSchema>;

export const reviewCorrectionSchema = z.object({
  status: z.enum(['APPROVED', 'REJECTED']),
  note: z.string().max(2000).optional(),
});
export type ReviewCorrectionInput = z.infer<typeof reviewCorrectionSchema>;

export const organisationPolicySchema = z.object({
  timezone: z.string().min(1).max(80).default('Asia/Kolkata'),
  reminderChannels: z.array(z.enum(['IN_APP', 'PUSH'])).min(1).default(['IN_APP', 'PUSH']),
  reminderRecipients: z.array(z.enum(['OWNER', 'REVIEWER', 'MANAGER'])).min(1).default(['OWNER', 'REVIEWER', 'MANAGER']),
  deadlineLeadMinutes: z.number().int().min(0).max(10080).default(120),
  reviewTargetMinutes: z.number().int().min(1).max(10080).default(480),
  updateThresholdMinutes: z.number().int().min(1).max(20160).default(960),
  earnedLeaveMonthly: z.number().min(0).max(31).default(1),
  casualLeaveMonthly: z.number().min(0).max(31).default(1),
  paidLeaveNames: z.array(z.string().trim().min(1).max(60)).default(['Earned Leave', 'Casual Leave', 'Sick Leave']),
  halfDayEnabled: z.boolean().default(true),
  lateGraceMinutes: z.number().int().min(0).max(240).default(10),
  maxConcurrentLeavePercent: z.number().int().min(1).max(100).default(100),
  unresolvedCorrectionTreatment: z.literal('EXCLUDE').default('EXCLUDE'),
  noReviewerDonePolicy: z.enum(['ALLOW', 'SMALL_ONLY', 'REQUIRE_REVIEWER']).default('ALLOW'),
  simplifiedReviewMaxMinutes: z.number().int().min(1).max(1440).default(120),
  effectiveFrom: z.string().date(),
});
export type OrganisationPolicyInput = z.infer<typeof organisationPolicySchema>;

export const payrollMonthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
export const payrollDecisionSchema = z.object({ note: z.string().trim().min(1).max(2000) });
export const createPayrollDraftSchema = z.object({ userId: z.string().uuid(), month: payrollMonthSchema });
export type CreatePayrollDraftInput = z.infer<typeof createPayrollDraftSchema>;

