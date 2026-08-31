import type { BoardProjectRef } from '@task-tracker/shared';

/**
 * The project a card is filed under, shown as a tinted pill. Falls back to a
 * neutral slate when the project has no colour set, so the chip never disappears
 * against the card.
 */
export function BoardProjectChip({
  project,
  taskRef,
  size = 'sm',
}: {
  project: BoardProjectRef;
  /** Ref of the mirror task, e.g. "WEB-12". Appended when the task exists. */
  taskRef?: string | null;
  size?: 'xs' | 'sm';
}) {
  const color = project.color ?? '#64748b';
  return (
    <span
      title={`${project.workspaceName} · ${project.name}${taskRef ? ` · ${taskRef}` : ''}`}
      className={`inline-flex max-w-full items-center gap-1 rounded-full border font-semibold ${
        size === 'xs' ? 'px-1.5 py-px text-[9px]' : 'px-2 py-0.5 text-[10px]'
      }`}
      style={{ borderColor: `${color}55`, color, backgroundColor: `${color}14` }}
    >
      <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
      <span className="truncate">{project.name}</span>
      {taskRef ? <span className="shrink-0 opacity-70">{taskRef}</span> : null}
    </span>
  );
}
