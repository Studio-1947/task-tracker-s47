import { useEffect, useRef, useState } from 'react';
import { useWorkspaces } from '../hooks/useWorkspaces';
import { useWorkspaceContext } from '../stores/workspace-context';

export function WorkspaceSwitcher({ collapsed = false, className = '' }: { collapsed?: boolean; className?: string }) {
  const { data: workspaces = [] } = useWorkspaces();
  const workspaceIds = useWorkspaceContext((state) => state.workspaceIds);
  const setWorkspaceIds = useWorkspaceContext((state) => state.setWorkspaceIds);
  const toggleWorkspace = useWorkspaceContext((state) => state.toggleWorkspace);
  const clearWorkspaceSelection = useWorkspaceContext((state) => state.clearWorkspaceSelection);
  const [open, setOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);
  const active = workspaces.filter((workspace) => !workspace.isArchived);
  const label =
    workspaceIds.length === 0
      ? 'All workspaces'
      : workspaceIds.length === 1
        ? (active.find((workspace) => workspace.id === workspaceIds[0])?.name ?? '1 workspace')
        : `${workspaceIds.length} workspaces`;

  useEffect(() => {
    if (!open) return;
    const closeOnOutsidePress = (event: PointerEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', closeOnOutsidePress);
    return () => document.removeEventListener('pointerdown', closeOnOutsidePress);
  }, [open]);

  useEffect(() => {
    if (!active.length) return;
    const activeIds = new Set(active.map((workspace) => workspace.id));
    const validIds = workspaceIds.filter((workspaceId) => activeIds.has(workspaceId));
    if (validIds.length !== workspaceIds.length) setWorkspaceIds(validIds);
  }, [active, setWorkspaceIds, workspaceIds]);

  if (collapsed) return null;
  return (
    <div ref={pickerRef} className={`relative ${className}`}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-left text-xs font-semibold text-slate-700 shadow-sm hover:border-indigo-300 dark:border-slate-700 dark:bg-[#1a1a1a] dark:text-slate-200"
      >
        <svg
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className="shrink-0"
        >
          <path d="M3 21V3h18v18H3Z" />
          <path d="M3 9h18M9 21V9" />
        </svg>
        <span className="min-w-0 flex-1 truncate">{label}</span>
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className="shrink-0"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {open ? (
        <div className="absolute left-0 top-full z-50 mt-1 w-full min-w-[240px] rounded-xl border border-slate-200 bg-white p-2 shadow-xl dark:border-slate-700 dark:bg-[#202020]">
          <div className="mb-1 flex items-center justify-between px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
            <span>Workspace scope</span>
            <button
              type="button"
              onClick={() => {
                clearWorkspaceSelection();
                setOpen(false);
              }}
              className="text-indigo-600 hover:underline dark:text-indigo-400"
            >
              All
            </button>
          </div>
          <div className="max-h-56 overflow-y-auto">
            {active.map((workspace) => (
              <label
                key={workspace.id}
                className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-2 text-sm hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                <input
                  type="checkbox"
                  checked={workspaceIds.includes(workspace.id)}
                  onChange={() => toggleWorkspace(workspace.id)}
                  className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                />
                <span className="truncate">{workspace.name}</span>
              </label>
            ))}
          </div>
          <div className="mt-2 border-t border-slate-100 px-2 pt-2 dark:border-slate-700">
            <span className="block text-[10px] leading-relaxed text-slate-400">
              No selection includes every workspace.
            </span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="ml-auto mt-2 block rounded-md bg-indigo-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-indigo-500"
            >
              Done
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
