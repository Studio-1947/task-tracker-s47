import { Link } from 'react-router-dom';
import { useReviewQueue } from '../hooks/useTasks';
import { formatDateTime, formatWorkingDuration } from '../lib/format';
import { Avatar } from '../components/Avatar';
import { Badge, Card, EmptyState, ErrorState, Spinner } from '../components/ui';

/** Working-time thresholds for how long a submission has waited on review. */
function waitingTone(minutes: number | null): 'slate' | 'amber' | 'green' {
  if (minutes === null) return 'slate';
  return minutes >= 480 ? 'amber' : 'green';
}

export function ReviewQueuePage() {
  const { data, isLoading, error } = useReviewQueue();
  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div>
        <h1 className="text-xl font-bold text-slate-900 dark:text-white">Review queue</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Submissions waiting on you, oldest first. Waiting time counts working hours only, so weekends and holidays do not inflate it.
        </p>
      </div>
      {isLoading ? <Spinner /> : null}
      {error ? <ErrorState message="Could not load the review queue." /> : null}
      {data && data.length === 0 ? <EmptyState title="Nothing waiting" hint="No submissions need your review right now." /> : null}
      <div className="space-y-3">
        {data?.map((item) => (
          <Card key={item.submissionId} className="p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <Link to={`/workspaces/${item.workspaceId}?task=${item.taskId}`} className="font-semibold text-indigo-600 hover:underline dark:text-indigo-400">
                  {item.taskRef} · {item.taskTitle}
                </Link>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  {item.workspaceName} · submitted {formatDateTime(item.submittedAt)}
                </p>
                <p className="mt-2 flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                  <Avatar user={item.submitter} size="sm" /> {item.submitter.name}
                </p>
              </div>
              <div className="flex flex-col items-end gap-1">
                <Badge tone={waitingTone(item.waitingWorkingMinutes)}>
                  {item.waitingWorkingMinutes === null ? 'Waiting' : `Waiting ${formatWorkingDuration(item.waitingWorkingMinutes)} (working)`}
                </Badge>
                <span className="text-xs text-slate-500">{formatWorkingDuration(item.waitingWallMinutes)} elapsed</span>
                {item.delegatedBy ? <Badge tone="amber">Delegated by {item.delegatedBy.name}</Badge> : null}
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
