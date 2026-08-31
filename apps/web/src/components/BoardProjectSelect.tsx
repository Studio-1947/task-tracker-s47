import type { MeetingProjectOption } from '@task-tracker/shared';
import { useMeetingProjectOptions } from '../hooks/useMeetings';

/** Group the flat option list by workspace so long lists stay navigable. */
function byWorkspace(options: MeetingProjectOption[]): [string, MeetingProjectOption[]][] {
  const groups = new Map<string, MeetingProjectOption[]>();
  for (const o of options) groups.set(o.workspaceName, [...(groups.get(o.workspaceName) ?? []), o]);
  return [...groups.entries()];
}

/**
 * Picks the project a card is filed under. `''` means unfiled — filing a card
 * mirrors it as a real task in that project, so the empty option is offered
 * explicitly rather than left as an accident of an empty select.
 */
export function BoardProjectSelect({
  value,
  onChange,
  disabled,
  size = 'md',
  unfiledLabel = 'No project',
  className = '',
}: {
  value: string;
  onChange: (projectId: string) => void;
  disabled?: boolean;
  size?: 'sm' | 'md';
  unfiledLabel?: string;
  className?: string;
}) {
  const { data: options, isLoading } = useMeetingProjectOptions();
  const groups = byWorkspace(options ?? []);

  return (
    <select
      value={value}
      disabled={disabled || isLoading}
      onChange={(e) => onChange(e.target.value)}
      className={`w-full rounded-lg border border-slate-200 bg-white/80 outline-none transition focus:border-indigo-500 disabled:opacity-60 dark:border-[#2d2d2d] dark:bg-[#1a1a1a] dark:text-white ${
        size === 'sm' ? 'px-2 py-1 text-[11px]' : 'px-3 py-2 text-sm'
      } ${className}`}
    >
      <option value="">{isLoading ? 'Loading projects…' : unfiledLabel}</option>
      {groups.map(([workspaceName, projects]) => (
        <optgroup key={workspaceName} label={workspaceName}>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}
