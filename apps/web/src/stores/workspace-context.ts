import { create } from 'zustand';

interface WorkspaceContextState {
  workspaceIds: string[];
  setWorkspaceIds: (workspaceIds: string[]) => void;
  toggleWorkspace: (workspaceId: string) => void;
  clearWorkspaceSelection: () => void;
}

function initialWorkspaceIds(): string[] {
  try {
    const value = JSON.parse(localStorage.getItem('tt.workspace-context') ?? '[]');
    return Array.isArray(value) && value.every((id) => typeof id === 'string') ? value : [];
  } catch {
    return [];
  }
}

export const useWorkspaceContext = create<WorkspaceContextState>((set) => ({
  workspaceIds: initialWorkspaceIds(),
  setWorkspaceIds: (workspaceIds) => {
    const uniqueIds = [...new Set(workspaceIds)];
    localStorage.setItem('tt.workspace-context', JSON.stringify(uniqueIds));
    set({ workspaceIds: uniqueIds });
  },
  toggleWorkspace: (workspaceId) =>
    set((state) => {
      const workspaceIds = state.workspaceIds.includes(workspaceId)
        ? state.workspaceIds.filter((id) => id !== workspaceId)
        : [...state.workspaceIds, workspaceId];
      localStorage.setItem('tt.workspace-context', JSON.stringify(workspaceIds));
      return { workspaceIds };
    }),
  clearWorkspaceSelection: () => {
    localStorage.removeItem('tt.workspace-context');
    set({ workspaceIds: [] });
  },
}));
