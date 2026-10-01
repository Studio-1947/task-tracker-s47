import { useEffect, useState } from 'react';
import { nonWorkingReason, useCalendar } from '../hooks/useCalendar';
import { formatWorkingDuration } from '../lib/format';
import { Button } from './ui';

/**
 * Commitment-date editor (spec §2): warns when the date is a weekly off or
 * holiday and lets the user keep it only with a reason; any change to an
 * existing commitment also needs a reason, which the server stores in the audit
 * trail alongside the retained original commitment.
 */
export function DueDateEditor({
  value,
  originalValue,
  overdueWorkingMinutes,
  onCommit,
}: {
  value: string | null;
  originalValue: string | null;
  overdueWorkingMinutes: number | null;
  onCommit: (iso: string | null, reason?: string) => void;
}) {
  const { data: cal } = useCalendar();
  const current = value ? value.slice(0, 10) : '';
  const [draft, setDraft] = useState(current);
  const [reason, setReason] = useState('');
  useEffect(() => {
    setDraft(current);
    setReason('');
  }, [current]);

  const changed = draft !== current;
  const offReason = draft ? nonWorkingReason(draft, cal) : null;
  const revising = changed && !!value;
  const needsReason = revising || (changed && !!offReason);
  const canSave = changed && (!needsReason || reason.trim().length > 0);
  const originalChanged = !!originalValue && !!value && originalValue.slice(0, 10) !== current;

  return (
    <div>
      <input
        aria-label="Due date"
        type="date"
        className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 bg-white dark:bg-[#252525] dark:text-white outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/10 transition-all font-semibold text-sm"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
      />
      {cal && draft && !offReason ? (
        <p className="mt-1.5 text-[11px] font-medium normal-case tracking-normal text-slate-400">
          Date-only deadlines close at the end of the working day ({endLabel(cal.settings.endMinute)}, {cal.settings.timezone}).
        </p>
      ) : null}
      {offReason ? (
        <p role="alert" className="mt-1.5 text-[11px] font-semibold normal-case tracking-normal text-amber-600 dark:text-amber-400">
          {draft} is {offReason}. Pick a working day, or keep it with a reason.
        </p>
      ) : null}
      {changed && needsReason ? (
        <input
          aria-label="Reason for deadline"
          className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-normal normal-case tracking-normal dark:border-slate-800 dark:bg-[#252525] dark:text-white"
          placeholder={revising ? 'Why is the deadline changing?' : 'Why is this off-day deadline intentional?'}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      ) : null}
      {changed ? (
        <div className="mt-2 flex gap-2">
          <Button
            type="button"
            className="px-3 py-1.5 text-xs"
            disabled={!canSave}
            onClick={() => onCommit(draft ? new Date(draft).toISOString() : null, reason.trim() || undefined)}
          >
            Save deadline
          </Button>
          <Button type="button" variant="ghost" className="px-3 py-1.5 text-xs" onClick={() => { setDraft(current); setReason(''); }}>
            Cancel
          </Button>
        </div>
      ) : null}
      {originalChanged ? (
        <p className="mt-1.5 text-[11px] font-semibold normal-case tracking-normal text-amber-600 dark:text-amber-400">
          Original commitment: {new Date(originalValue!).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
        </p>
      ) : null}
      {overdueWorkingMinutes !== null ? (
        <p className="mt-1.5 text-[11px] font-semibold normal-case tracking-normal text-red-600 dark:text-red-400">
          {formatWorkingDuration(overdueWorkingMinutes)} overdue (scheduled working time)
        </p>
      ) : null}
    </div>
  );
}

function endLabel(minute: number): string {
  return `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
}
