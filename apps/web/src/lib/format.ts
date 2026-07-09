import {
  AuditAction,
  Priority,
  TASK_STATUS_LABELS,
  TaskStatus,
  type AuditEntry,
} from '@task-tracker/shared';

export const statusLabel = (s: TaskStatus): string => TASK_STATUS_LABELS[s] ?? s;

export const statusClasses: Record<TaskStatus, string> = {
  TODO: 'bg-slate-100 text-slate-600',
  IN_PROGRESS: 'bg-blue-100 text-blue-700',
  IN_REVIEW: 'bg-amber-100 text-amber-700',
  DONE: 'bg-green-100 text-green-700',
};

export const priorityClasses: Record<Priority, string> = {
  LOW: 'bg-slate-100 text-slate-500',
  MEDIUM: 'bg-sky-100 text-sky-700',
  HIGH: 'bg-orange-100 text-orange-700',
  URGENT: 'bg-red-100 text-red-700',
};

export function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function isOverdue(iso: string | null): boolean {
  return !!iso && new Date(iso).getTime() < Date.now();
}

/** Human sentence for an audit entry (for the history timeline). */
export function describeAudit(e: AuditEntry): string {
  const who = e.user.name;
  const val = (v: unknown): string => {
    if (v === null || v === undefined || v === '') return '∅';
    if (Array.isArray(v)) return v.length ? `${v.length} user(s)` : 'none';
    return String(v);
  };
  switch (e.action) {
    case AuditAction.CREATED:
      return `${who} created this task`;
    case AuditAction.STATUS_CHANGED:
      return `${who} changed status ${val(e.beforeValue)} → ${val(e.afterValue)}`;
    case AuditAction.PRIORITY_CHANGED:
      return `${who} changed priority ${val(e.beforeValue)} → ${val(e.afterValue)}`;
    case AuditAction.DUE_DATE_CHANGED:
      return `${who} changed due date ${val(e.beforeValue)} → ${val(e.afterValue)}`;
    case AuditAction.TITLE_CHANGED:
      return `${who} renamed the task`;
    case AuditAction.DESCRIPTION_CHANGED:
      return `${who} edited the description`;
    case AuditAction.ASSIGNEE_CHANGED:
      return `${who} changed assignees`;
    case AuditAction.COMMENTED:
      return `${who} commented`;
    case AuditAction.ATTACHMENT_ADDED:
      return `${who} added an attachment`;
    case AuditAction.ATTACHMENT_REMOVED:
      return `${who} removed an attachment`;
    case AuditAction.ARCHIVED:
      return `${who} archived the task`;
    case AuditAction.DELETED:
      return `${who} deleted the task`;
    default:
      return `${who} updated the task`;
  }
}
