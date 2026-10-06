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

export function ProgressPie({
  progress,
  size = 40,
  compact = false,
}: {
  progress: BoardProgress;
  size?: number;
  compact?: boolean;
}) {
  const { total, done, inProgress, percent } = progress;
  const donePct = total === 0 ? 0 : (done / total) * 100;
  const wipPct = total === 0 ? 0 : (inProgress / total) * 100;

  // Emerald for done, amber for wip, slate for remaining.
  const gradient = `conic-gradient(
    #10b981 0% ${donePct}%, 
    #fbbf24 ${donePct}% ${donePct + wipPct}%, 
    #f1f5f9 ${donePct + wipPct}% 100%
  )`;
  const darkGradient = `conic-gradient(
    #10b981 0% ${donePct}%, 
    #f59e0b ${donePct}% ${donePct + wipPct}%, 
    #262626 ${donePct + wipPct}% 100%
  )`;

  return (
    <div className="flex items-center gap-2">
      <div className="flex flex-col text-right">
        <span className="text-sm font-bold text-slate-700 dark:text-slate-200">{percent}%</span>
        {!compact && (
          <span className="text-[10px] font-medium text-slate-400 dark:text-slate-500">
            {done}/{total} done
          </span>
        )}
      </div>
      <div 
        className="relative flex items-center justify-center rounded-full"
        style={{ width: size, height: size }}
      >
        <div 
          className="absolute inset-0 rounded-full dark:hidden"
          style={{ background: gradient }}
        />
        <div 
          className="absolute inset-0 rounded-full hidden dark:block"
          style={{ background: darkGradient }}
        />
        {/* Inner circle to make it a donut */}
        <div className="absolute inset-[3px] rounded-full bg-white dark:bg-[#161616]" />
      </div>
    </div>
  );
}
