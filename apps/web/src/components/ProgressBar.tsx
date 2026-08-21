import type { BoardProgress } from '@task-tracker/shared';

const SIZES = {
  sm: 'h-1.5',
  md: 'h-2.5',
  lg: 'h-3.5',
} as const;

/**
 * Two-segment completion bar: solid emerald for DONE, a lighter amber band for
 * IN_PROGRESS. The headline percentage counts DONE only, so it never overstates.
 */
export function ProgressBar({
  progress,
  size = 'md',
  showLabel = true,
  className = '',
}: {
  progress: BoardProgress;
  size?: keyof typeof SIZES;
  showLabel?: boolean;
  className?: string;
}) {
  const { total, done, inProgress, percent } = progress;
  const donePct = total === 0 ? 0 : (done / total) * 100;
  const wipPct = total === 0 ? 0 : (inProgress / total) * 100;

  return (
    <div className={className}>
      <div
        className={`flex w-full overflow-hidden rounded-full bg-slate-100 dark:bg-[#262626] ${SIZES[size]}`}
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${done} of ${total} done`}
      >
        <div
          className="bg-gradient-to-r from-emerald-500 to-emerald-400 transition-all duration-300"
          style={{ width: `${donePct}%` }}
        />
        <div
          className="bg-amber-300/70 dark:bg-amber-500/40 transition-all duration-300"
          style={{ width: `${wipPct}%` }}
        />
      </div>
      {showLabel ? (
        <div className="mt-1.5 flex items-center justify-between text-[11px] font-medium text-slate-450 dark:text-slate-500">
          <span>
            {done}/{total} done
            {inProgress > 0 ? <span className="text-amber-600 dark:text-amber-450"> · {inProgress} in progress</span> : null}
          </span>
          <span className="font-semibold text-slate-600 dark:text-slate-350">{percent}%</span>
        </div>
      ) : null}
    </div>
  );
}
