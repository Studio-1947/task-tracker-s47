import { describe, expect, it } from 'vitest';
import { createTaskSchema, reviewTaskSchema, submitTaskSchema, updateTaskSchema } from '@task-tracker/shared';

const id = '11111111-1111-4111-8111-111111111111';

describe('task planning and review schemas', () => {
  it('accepts accountable planning fields and minute estimates', () => {
    const result = createTaskSchema.parse({
      projectId: id,
      title: 'Prepare launch pack',
      ownerId: id,
      reviewerId: '22222222-2222-4222-8222-222222222222',
      baselineEstimateMinutes: 135,
      currentEstimateMinutes: 150,
      remainingEstimateMinutes: 30,
    });
    expect(result.baselineEstimateMinutes).toBe(135);
    expect(result.remainingEstimateMinutes).toBe(30);
  });

  it('rejects negative and fractional minute estimates', () => {
    expect(updateTaskSchema.safeParse({ currentEstimateMinutes: -1 }).success).toBe(false);
    expect(updateTaskSchema.safeParse({ remainingEstimateMinutes: 1.5 }).success).toBe(false);
  });

  it('requires an evidence attachment and non-empty delivery note', () => {
    expect(submitTaskSchema.safeParse({ evidenceAttachmentId: id, note: 'Ready for review' }).success).toBe(true);
    expect(submitTaskSchema.safeParse({ evidenceAttachmentId: id, note: '   ' }).success).toBe(false);
  });

  it('requires a reason when work is returned', () => {
    expect(reviewTaskSchema.safeParse({ decision: 'ACCEPTED' }).success).toBe(true);
    expect(reviewTaskSchema.safeParse({ decision: 'RETURNED' }).success).toBe(false);
    expect(reviewTaskSchema.safeParse({ decision: 'RETURNED', note: 'Missing signed approval' }).success).toBe(true);
  });
});
