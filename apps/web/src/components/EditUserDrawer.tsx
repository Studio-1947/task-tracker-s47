import { useEffect, useState } from 'react';
import {
  ROLES,
  type Role,
  type UserSummary,
  type GenderType,
  type UpdateUserInput,
} from '@task-tracker/shared';
import { Button, Input } from './ui';
import { useWorkspaces } from '../hooks/useWorkspaces';

export function EditUserDrawer({
  user,
  onClose,
  busy,
  onSave,
  isMe,
}: {
  user: UserSummary;
  onClose: () => void;
  busy: boolean;
  onSave: (patch: UpdateUserInput) => void;
  isMe: boolean;
}) {
  const [roleDraft, setRoleDraft] = useState<Role>(user.role);
  const [roleConfirm, setRoleConfirm] = useState(false);
  const [designationDraft, setDesignationDraft] = useState(user.designation ?? '');
  const [genderDraft, setGenderDraft] = useState<GenderType>(user.gender ?? 'UNSPECIFIED');
  const [workspacesDraft, setWorkspacesDraft] = useState<string[]>(user.workspaceIds ?? []);

  const { data: allWorkspaces } = useWorkspaces();
  const activeWorkspaces = allWorkspaces?.filter((w) => !w.isArchived) ?? [];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const handleSave = () => {
    const patch: UpdateUserInput = {};
    
    if (roleDraft !== user.role) {
      if (!roleConfirm) {
        setRoleConfirm(true);
        return;
      }
      patch.role = roleDraft;
    }
    
    const nextDesig = designationDraft.trim() || null;
    if (nextDesig !== user.designation) {
      patch.designation = nextDesig;
    }
    
    if (genderDraft !== user.gender) {
      patch.gender = genderDraft;
    }
    
    const oldW = user.workspaceIds ?? [];
    const same = oldW.length === workspacesDraft.length && oldW.every((id) => workspacesDraft.includes(id));
    if (!same) {
      patch.workspaceIds = workspacesDraft;
    }

    if (Object.keys(patch).length > 0) {
      onSave(patch);
    }
    
    onClose();
  };

  const toggleWorkspace = (id: string) => {
    setWorkspacesDraft((prev) => 
      prev.includes(id) ? prev.filter(w => w !== id) : [...prev, id]
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="fixed inset-0 bg-[#090d16]/30 backdrop-blur-sm dark:bg-[#121212]/50" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Edit ${user.name}`}
        className="animate-slide-in-right relative z-50 w-full max-w-md bg-white shadow-2xl dark:bg-[#161616] flex flex-col h-full border-l border-slate-100 dark:border-slate-800"
      >
        <div className="flex items-center justify-between p-5 border-b border-slate-100 dark:border-slate-800/50">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">Edit {user.name}</h2>
          <Button variant="ghost" onClick={onClose} className="px-2.5 py-1.5">Close</Button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          <div>
            <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-550 dark:text-slate-400">Designation</label>
            <Input 
              value={designationDraft} 
              onChange={(e) => setDesignationDraft(e.target.value)} 
              disabled={busy} 
              placeholder="e.g. Director, Analyst..."
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-550 dark:text-slate-400">Gender</label>
            <select
              className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#1a1a1a] px-3 py-2 text-sm text-slate-700 dark:text-white outline-none focus:border-indigo-500 transition-all font-semibold"
              value={genderDraft}
              onChange={(e) => setGenderDraft(e.target.value as GenderType)}
              disabled={busy}
            >
              <option value="UNSPECIFIED">Unspecified</option>
              <option value="MALE">Male</option>
              <option value="FEMALE">Female</option>
              <option value="OTHER">Other</option>
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-550 dark:text-slate-400">Role</label>
            <select
              className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#1a1a1a] px-3 py-2 text-sm text-slate-700 dark:text-white outline-none focus:border-indigo-500 transition-all font-semibold"
              value={roleDraft}
              onChange={(e) => {
                setRoleDraft(e.target.value as Role);
                setRoleConfirm(false);
              }}
              disabled={busy || isMe}
              title={isMe ? 'You cannot change your own role' : undefined}
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>
          
          <div>
            <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-slate-550 dark:text-slate-400">
              Workspaces ({workspacesDraft.length})
            </label>
            <div className="max-h-64 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 p-2 space-y-1">
              {activeWorkspaces.length === 0 ? (
                <div className="p-2 text-sm text-slate-500 dark:text-slate-400 text-center">No active workspaces</div>
              ) : (
                activeWorkspaces.map((w) => (
                  <label key={w.id} className="flex items-center gap-3 rounded p-2 hover:bg-slate-200/50 dark:hover:bg-slate-800/50 transition cursor-pointer">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-600 dark:border-slate-700 dark:bg-slate-800 dark:focus:ring-indigo-600/50"
                      checked={workspacesDraft.includes(w.id)}
                      onChange={() => toggleWorkspace(w.id)}
                      disabled={busy}
                    />
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-300 select-none">
                      {w.name}
                    </span>
                  </label>
                ))
              )}
            </div>
          </div>
        </div>
        <div className="p-5 border-t border-slate-100 dark:border-slate-800/50 bg-slate-50 dark:bg-slate-900/50 flex flex-col gap-3">
          {roleConfirm && roleDraft !== user.role ? (
            <div className="p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 rounded-lg text-sm text-amber-800 dark:text-amber-300">
              <span className="font-bold block mb-1">Confirm Role Change</span>
              Are you sure you want to change {user.name}'s role from <strong>{user.role}</strong> to <strong>{roleDraft}</strong>?
            </div>
          ) : null}
          <div className="flex gap-2 justify-end">
            <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
            <Button onClick={handleSave} disabled={busy}>
              {roleConfirm ? 'Confirm & Save' : 'Save Changes'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
