import { Link } from 'react-router-dom';
import type { BoardProjectRef } from '@task-tracker/shared';

/**
 * The project a card is filed under, shown as a tinted pill. Clicking opens the
 * mirrored task in its workspace when `taskId` is supplied.
 */
export function BoardProjectChip({
  project,
  taskRef,
  taskId,
  size = 'sm',
}: {
  project: BoardProjectRef;
  /** Ref of the mirror task, e.g. "WEB-12". Appended when the task exists. */
  taskRef?: string | null;
  /** Id of the mirror task to link directly to workspace. */
  taskId?: string | null;
  size?: 'xs' | 'sm';
}) {
  const color = project.color ?? '#64748b';

  const chipContent = (
    <>
      <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
      <span className="truncate">{project.name}</span>
      {taskRef ? <span className="shrink-0 font-mono font-bold opacity-80">🔗 {taskRef}</span> : null}
    </>
  );

  if (taskId && project.workspaceId) {
    return (
      <Link
        to={`/workspaces/${project.workspaceId}?task=${taskId}`}
        onClick={(e) => e.stopPropagation()}
        title={`Click to open task ${taskRef ?? ''} in ${project.workspaceName}`}
        className={`inline-flex max-w-full items-center gap-1 rounded-full border font-semibold transition hover:opacity-85 hover:scale-[1.02] ${
          size === 'xs' ? 'px-1.5 py-px text-[9px]' : 'px-2 py-0.5 text-[10px]'
        }`}
        style={{ borderColor: `${color}55`, color, backgroundColor: `${color}14` }}
      >
        {chipContent}
      </Link>
    );
  }

  return (
    <span
      title={`${project.workspaceName} · ${project.name}${taskRef ? ` · ${taskRef}` : ''}`}
      className={`inline-flex max-w-full items-center gap-1 rounded-full border font-semibold ${
        size === 'xs' ? 'px-1.5 py-px text-[9px]' : 'px-2 py-0.5 text-[10px]'
      }`}
      style={{ borderColor: `${color}55`, color, backgroundColor: `${color}14` }}
    >
      {chipContent}
    </span>
  );
}
