import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { ReviewQueueItem } from '@task-tracker/shared';
import { useReviewQueue } from '../hooks/useTasks';
import { useAuth } from '../stores/auth';
import { ApiRequestError, http } from '../lib/api';
import { formatDate, formatDateTime, formatWorkingDuration } from '../lib/format';
import { Avatar } from '../components/Avatar';
import { Badge, Button, Card, EmptyState, ErrorState, Spinner } from '../components/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';

/** Working-time thresholds for how long a submission has waited on review. */
function waitingTone(minutes: number | null): 'slate' | 'amber' | 'green' {
  if (minutes === null) return 'slate';
  return minutes >= 480 ? 'amber' : 'green';
}

function QueueItem({ item }: { item: ReviewQueueItem }) {
  const qc = useQueryClient();
  const [note, setNote] = useState('');
  const [showReturns, setShowReturns] = useState(false);
  const decide = useMutation({
    mutationFn: (decision: 'ACCEPTED' | 'RETURNED') =>
      http.post(`/tasks/${item.taskId}/submissions/${item.submissionId}/review`, { decision, note: note.trim() || undefined }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['review-queue'] });
      void qc.invalidateQueries({ queryKey: ['tasks'] });
      void qc.invalidateQueries({ queryKey: ['task', item.taskId] });
    },
  });
  const late = item.dueDate && new Date(item.submittedAt) > new Date(item.dueDate);
  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Link to={`/workspaces/${item.workspaceId}?task=${item.taskId}`} className="font-semibold text-indigo-600 hover:underline dark:text-indigo-400">
            {item.taskRef} · {item.taskTitle}
          </Link>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {item.workspaceName} · {item.projectName} · submitted {formatDateTime(item.submittedAt)}
            {item.dueDate ? ` · due ${formatDate(item.dueDate)}` : ' · no deadline'}
            {late ? <span className="font-semibold text-red-600 dark:text-red-400"> (submitted after the deadline)</span> : null}
          </p>
          <p className="mt-2 flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
            <Avatar user={item.submitter} size="sm" /> {item.submitter.name}
            {item.reviewer ? <span className="text-xs text-slate-400">· reviewer {item.reviewer.name}</span> : null}
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

      <div className="mt-3 rounded-lg bg-slate-50 p-3 text-sm dark:bg-slate-850">
        <p className="whitespace-pre-wrap text-slate-700 dark:text-slate-200">{item.deliveryNote}</p>
        <p className="mt-1.5 text-xs text-slate-500">
          Evidence: {item.evidence ? item.evidence.fileName : 'attachment no longer available'}
        </p>
      </div>

      {item.priorReturns.length ? (
        <div className="mt-2">
          <button type="button" className="text-xs font-semibold text-amber-700 hover:underline dark:text-amber-400" onClick={() => setShowReturns((v) => !v)}>
            Returned {item.priorReturns.length} time{item.priorReturns.length === 1 ? '' : 's'} before {showReturns ? '(hide)' : '(show reasons)'}
          </button>
          {showReturns ? (
            <ul className="mt-1.5 space-y-1 text-xs text-slate-600 dark:text-slate-300">
              {item.priorReturns.map((r) => (
                <li key={r.decidedAt}><span className="text-slate-400">{formatDateTime(r.decidedAt)}:</span> {r.reason}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      <div className="mt-3 space-y-2">
        <textarea
          aria-label={`Review note for ${item.taskRef}`}
          rows={2}
          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-800 dark:bg-[#252525] dark:text-white"
          placeholder="Review note (required with concrete corrections when returning)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        <div className="flex flex-wrap gap-2">
          <Button disabled={decide.isPending} onClick={() => decide.mutate('ACCEPTED')}>Accept</Button>
          <Button variant="danger" disabled={decide.isPending || !note.trim()} onClick={() => decide.mutate('RETURNED')}>Return with corrections</Button>
          <Link to={`/workspaces/${item.workspaceId}?task=${item.taskId}`} className="self-center text-xs font-semibold text-indigo-600 hover:underline dark:text-indigo-400">
            Open task to delegate
          </Link>
        </div>
        {decide.error ? <p role="alert" className="text-sm text-red-600">{decide.error instanceof ApiRequestError ? decide.error.message : 'Could not record the decision'}</p> : null}
      </div>
    </Card>
  );
}

export function ReviewQueuePage() {
  const { data, isLoading, error } = useReviewQueue();
  const { user } = useAuth();
  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div>
        <h1 className="text-xl font-bold text-slate-900 dark:text-white">Review queue</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {user?.role === 'ADMIN' ? 'All pending submissions' : 'Submissions waiting on you'}, oldest first. Waiting time counts working hours only, so weekends and holidays do not inflate it. Review target: one working day.
        </p>
      </div>
      {isLoading ? <Spinner /> : null}
      {error ? <ErrorState message="Could not load the review queue." /> : null}
      {data && data.length === 0 ? <EmptyState title="Nothing waiting" hint="No submissions need your review right now." /> : null}
      <div className="space-y-3">
        {data?.map((item) => <QueueItem key={item.submissionId} item={item} />)}
      </div>
    </div>
  );
}
