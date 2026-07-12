import { useMemo, useState } from 'react';
import type { ConversationDetail } from '@task-tracker/shared';
import { useAddGroupMembers, useContacts, useRemoveGroupMember } from '../../hooks/useChat';
import { useAuth } from '../../stores/auth';
import { useChatUi } from '../../stores/chat';
import { Avatar } from '../Avatar';
import { Button, Input } from '../ui';
import { PresenceDot } from './helpers';

/**
 * Members panel for a conversation. Group admins can add/remove people here.
 * PROJECT channels are read-only: membership is inherited from the workspace.
 */
export function ConversationInfo({
  detail,
  onClose,
}: {
  detail: ConversationDetail;
  onClose: () => void;
}) {
  const myId = useAuth((s) => s.user?.id) ?? '';
  const online = useChatUi((s) => s.online);
  const [adding, setAdding] = useState(false);
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState<Record<string, string>>({});

  const addMembers = useAddGroupMembers(detail.id);
  const removeMember = useRemoveGroupMember(detail.id);
  const { data: contacts } = useContacts(q);

  const isGroup = detail.type === 'GROUP';
  const iAmAdmin = !!detail.members.find((m) => m.user.id === myId)?.isAdmin;
  const canManage = isGroup && iAmAdmin;

  const memberIds = useMemo(() => new Set(detail.members.map((m) => m.user.id)), [detail.members]);
  const candidates = (contacts ?? []).filter((c) => !memberIds.has(c.id));
  const pickedIds = Object.keys(picked);

  const submitAdd = async () => {
    if (pickedIds.length === 0) return;
    await addMembers.mutateAsync(pickedIds);
    setPicked({});
    setQ('');
    setAdding(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm">
      <div className="flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-[#2d2d2d] dark:bg-[#1a1a1a]">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-[#2d2d2d]">
          <div className="min-w-0">
            <h2 className="truncate text-base font-bold text-slate-800 dark:text-white">{detail.title}</h2>
            <p className="text-xs text-slate-400 dark:text-slate-500">
              {detail.type === 'PROJECT'
                ? 'Project channel · members follow the workspace'
                : `${detail.members.length} member${detail.members.length === 1 ? '' : 's'}`}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-[#242424]"
            aria-label="Close"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {canManage && !adding ? (
          <div className="px-5 pt-4">
            <Button variant="ghost" className="w-full text-xs font-semibold" onClick={() => setAdding(true)}>
              + Add people
            </Button>
          </div>
        ) : null}

        {canManage && adding ? (
          <div className="flex flex-col gap-2 px-5 pt-4">
            <Input placeholder="Search people…" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
            <div className="max-h-40 overflow-y-auto rounded-lg border border-slate-100 dark:border-[#2d2d2d]">
              {candidates.length === 0 ? (
                <p className="py-4 text-center text-xs text-slate-400">Nobody left to add</p>
              ) : (
                candidates.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() =>
                      setPicked((p) => {
                        const next = { ...p };
                        if (next[c.id]) delete next[c.id];
                        else next[c.id] = c.name;
                        return next;
                      })
                    }
                    className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-slate-50 dark:hover:bg-[#242424]"
                  >
                    <Avatar user={{ id: c.id, name: c.name, avatarKey: c.avatarKey }} size="sm" />
                    <span className="min-w-0 flex-1 truncate text-sm text-slate-700 dark:text-slate-200">
                      {c.name}
                    </span>
                    <span
                      className={`flex h-5 w-5 items-center justify-center rounded-md border text-[10px] ${
                        picked[c.id]
                          ? 'border-indigo-600 bg-indigo-600 text-white'
                          : 'border-slate-300 dark:border-slate-600'
                      }`}
                    >
                      {picked[c.id] ? '✓' : ''}
                    </span>
                  </button>
                ))
              )}
            </div>
            <div className="flex gap-2">
              <Button
                className="flex-1 text-xs"
                onClick={() => void submitAdd()}
                disabled={pickedIds.length === 0 || addMembers.isPending}
              >
                Add {pickedIds.length > 0 ? `(${pickedIds.length})` : ''}
              </Button>
              <Button
                variant="ghost"
                className="text-xs"
                onClick={() => {
                  setAdding(false);
                  setPicked({});
                  setQ('');
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : null}

        <div className="mt-4 min-h-0 flex-1 overflow-y-auto border-t border-slate-100 dark:border-[#2d2d2d]">
          {detail.members.map((m) => (
            <div
              key={m.user.id}
              className="flex items-center gap-3 px-5 py-2.5 hover:bg-slate-50 dark:hover:bg-[#242424]"
            >
              <div className="relative shrink-0">
                <Avatar user={m.user} size="sm" />
                <PresenceDot online={online.has(m.user.id)} className="absolute -bottom-0.5 -right-0.5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">
                  {m.user.name}
                  {m.user.id === myId ? <span className="text-slate-400"> (you)</span> : null}
                </div>
                <div className="truncate text-[11px] text-slate-400 dark:text-slate-500">{m.user.email}</div>
              </div>
              {m.isAdmin ? (
                <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500 dark:bg-[#2a2a2a] dark:text-slate-400">
                  Admin
                </span>
              ) : null}
              {canManage && m.user.id !== myId ? (
                <button
                  type="button"
                  onClick={() => removeMember.mutate(m.user.id)}
                  disabled={removeMember.isPending}
                  className="shrink-0 text-[11px] font-medium text-slate-400 hover:text-red-600 disabled:opacity-50 dark:hover:text-red-400"
                >
                  Remove
                </button>
              ) : null}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
