import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { OrganisationPolicyInput } from '@task-tracker/shared';
import { ApiRequestError, http } from '../lib/api';
import { Button, Card, ErrorState, Input, Spinner } from './ui';

/** The stored policy row: numeric columns come back as strings. */
type StoredPolicy = Omit<OrganisationPolicyInput, 'earnedLeaveMonthly' | 'casualLeaveMonthly'> & {
  version: number;
  earnedLeaveMonthly: string | number;
  casualLeaveMonthly: string | number;
};

const FIELDS: Array<{ key: 'deadlineLeadMinutes' | 'reviewTargetMinutes' | 'updateThresholdMinutes' | 'lateGraceMinutes' | 'maxConcurrentLeavePercent'; label: string; hint: string; min: number; max: number }> = [
  { key: 'deadlineLeadMinutes', label: 'Deadline reminder lead (minutes)', hint: 'How long before a due date the owner and reviewer are reminded.', min: 0, max: 10080 },
  { key: 'reviewTargetMinutes', label: 'Review target (working minutes)', hint: 'A pending review older than this triggers a review-overdue reminder. 480 = one working day.', min: 1, max: 10080 },
  { key: 'updateThresholdMinutes', label: 'Update threshold (working minutes)', hint: 'An in-progress task with no progress update for this long triggers an update-overdue reminder. 960 = two working days; leave, blocked and awaiting-review time is excluded.', min: 1, max: 20160 },
  { key: 'lateGraceMinutes', label: 'Late check-in grace (minutes)', hint: 'Check-ins within this many minutes of the start are not late.', min: 0, max: 240 },
  { key: 'maxConcurrentLeavePercent', label: 'Most of a team on leave at once (%)', hint: '100 turns the staffing check off. Below that, approving leave that would exceed it needs an explained override.', min: 1, max: 100 },
];

/** Admin: the organisation-wide reminder, attendance and leave thresholds. */
export function PolicyTab() {
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({ queryKey: ['organisation-policy'], queryFn: () => http.get<StoredPolicy>('/admin/organisation-policy') });
  const [draft, setDraft] = useState<Record<string, number>>({});
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (data) setDraft(Object.fromEntries(FIELDS.map((f) => [f.key, (data as unknown as Record<string, number>)[f.key] ?? 0])));
  }, [data]);

  const save = useMutation({
    mutationFn: () => {
      const p = data!;
      const body: OrganisationPolicyInput = {
        timezone: p.timezone,
        reminderChannels: p.reminderChannels,
        reminderRecipients: p.reminderRecipients,
        deadlineLeadMinutes: draft.deadlineLeadMinutes!,
        reviewTargetMinutes: draft.reviewTargetMinutes!,
        updateThresholdMinutes: draft.updateThresholdMinutes!,
        earnedLeaveMonthly: Number(p.earnedLeaveMonthly),
        casualLeaveMonthly: Number(p.casualLeaveMonthly),
        paidLeaveNames: p.paidLeaveNames,
        halfDayEnabled: p.halfDayEnabled,
        lateGraceMinutes: draft.lateGraceMinutes!,
        maxConcurrentLeavePercent: draft.maxConcurrentLeavePercent!,
        unresolvedCorrectionTreatment: p.unresolvedCorrectionTreatment,
        effectiveFrom: p.effectiveFrom,
      };
      return http.put('/admin/organisation-policy', body);
    },
    onSuccess: () => {
      setSaved(true);
      qc.invalidateQueries({ queryKey: ['organisation-policy'] });
    },
  });

  if (isLoading) return <Spinner />;
  if (error || !data) return <ErrorState message="Could not load the organisation policy." />;

  return (
    <Card className="max-w-2xl space-y-4 p-5">
      <p className="text-sm text-slate-500 dark:text-slate-400">Policy version {data.version}. Changes apply to reminders and leave decisions from the next check.</p>
      {FIELDS.map((f) => (
        <label key={f.key} className="block">
          <span className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">{f.label}</span>
          <Input
            type="number"
            min={f.min}
            max={f.max}
            value={draft[f.key] ?? ''}
            onChange={(e) => { setSaved(false); setDraft((d) => ({ ...d, [f.key]: Number(e.target.value) })); }}
          />
          <span className="mt-1 block text-xs text-slate-400 dark:text-slate-500">{f.hint}</span>
        </label>
      ))}
      <div className="flex items-center gap-3">
        <Button onClick={() => save.mutate()} disabled={save.isPending}>Save policy</Button>
        {saved ? <span className="text-sm text-emerald-600 dark:text-emerald-400">Saved</span> : null}
        {save.error ? <span className="text-sm text-red-600">{save.error instanceof ApiRequestError ? save.error.message : 'Could not save'}</span> : null}
      </div>
    </Card>
  );
}
