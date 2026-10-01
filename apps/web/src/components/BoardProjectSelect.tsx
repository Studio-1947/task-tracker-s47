import { useMemo } from 'react';
import { useMeetingProjectOptions } from '../hooks/useMeetings';
import { SearchableSelect } from './SearchableSelect';

/**
 * Picks the project a card is filed under. `''` means unfiled — filing a card
 * mirrors it as a real task in that project, so the empty option is offered
 * explicitly. Searchable, because the full list spans every workspace.
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
  const items = useMemo(
    () => (options ?? []).map((p) => ({ value: p.id, label: p.name, group: p.workspaceName, hint: p.taskPrefix })),
    [options],
  );
  return (
    <SearchableSelect
      options={items}
      value={value}
      onChange={onChange}
      emptyLabel={unfiledLabel}
      placeholder="Search projects or workspaces…"
      ariaLabel="Project"
      disabled={disabled}
      loading={isLoading}
      size={size}
      className={className}
    />
  );
}
