import { useState } from 'react';
import type { ChatContact } from '@task-tracker/shared';
import { useContacts, useCreateDirect, useCreateGroup } from '../../hooks/useChat';
import { Avatar } from '../Avatar';
import { Button, Input, Spinner } from '../ui';

export function NewChatModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (conversationId: string) => void;
}) {
  const [mode, setMode] = useState<'direct' | 'group'>('direct');
  const [q, setQ] = useState('');
  const [groupTitle, setGroupTitle] = useState('');
  const [selected, setSelected] = useState<Record<string, string>>({}); // id → name
  const { data: contacts, isLoading } = useContacts(q);
  const createDirect = useCreateDirect();
  const createGroup = useCreateGroup();

  const startDirect = async (c: ChatContact) => {
    const conv = await createDirect.mutateAsync(c.id);
    onCreated(conv.id);
  };

  const toggle = (c: ChatContact) =>
    setSelected((prev) => {
      const next = { ...prev };
      if (next[c.id]) delete next[c.id];
      else next[c.id] = c.name;
      return next;
    });

  const submitGroup = async () => {
    const memberIds = Object.keys(selected);
    if (!groupTitle.trim() || memberIds.length === 0) return;
    const conv = await createGroup.mutateAsync({ title: groupTitle.trim(), memberIds });
    onCreated(conv.id);
  };

  const selectedIds = Object.keys(selected);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm">
      <div className="flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-[#2d2d2d] dark:bg-[#1a1a1a]">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-[#2d2d2d]">
          <h2 className="text-base font-bold text-slate-800 dark:text-white">New conversation</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-[#242424]"
            aria-label="Close"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex gap-1 px-5 pt-3">
          {(['direct', 'group'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                mode === m
                  ? 'bg-indigo-50 text-indigo-600 dark:bg-indigo-950/30 dark:text-indigo-400'
                  : 'text-slate-500 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-[#242424]'
              }`}
            >
              {m === 'direct' ? 'Direct message' : 'New group'}
            </button>
          ))}
        </div>

        <div className="flex flex-col gap-3 p-5">
          {mode === 'group' ? (
            <Input
              placeholder="Group name"
              value={groupTitle}
              onChange={(e) => setGroupTitle(e.target.value)}
            />
          ) : null}
          <Input placeholder="Search people…" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />

          {mode === 'group' && selectedIds.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {selectedIds.map((id) => (
                <span
                  key={id}
                  className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-medium text-indigo-600 dark:bg-indigo-950/30 dark:text-indigo-400"
                >
                  {selected[id]}
                </span>
              ))}
            </div>
          ) : null}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto border-t border-slate-100 dark:border-[#2d2d2d]">
          {isLoading ? (
            <Spinner />
          ) : (contacts ?? []).length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-400">No people found</p>
          ) : (
            (contacts ?? []).map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => (mode === 'direct' ? void startDirect(c) : toggle(c))}
                className="flex w-full items-center gap-3 px-5 py-2.5 text-left hover:bg-slate-50 dark:hover:bg-[#242424]"
              >
                <Avatar user={{ id: c.id, name: c.name, avatarKey: c.avatarKey }} size="sm" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">{c.name}</div>
                  {c.designation ? (
                    <div className="truncate text-[11px] text-slate-400 dark:text-slate-500">{c.designation}</div>
                  ) : null}
                </div>
                {mode === 'group' ? (
                  <span
                    className={`flex h-5 w-5 items-center justify-center rounded-md border ${
                      selected[c.id]
                        ? 'border-indigo-600 bg-indigo-600 text-white'
                        : 'border-slate-300 dark:border-slate-600'
                    }`}
                  >
                    {selected[c.id] ? '✓' : ''}
                  </span>
                ) : null}
              </button>
            ))
          )}
        </div>

        {mode === 'group' ? (
          <div className="border-t border-slate-100 p-4 dark:border-[#2d2d2d]">
            <Button
              className="w-full"
              onClick={() => void submitGroup()}
              disabled={!groupTitle.trim() || selectedIds.length === 0 || createGroup.isPending}
            >
              Create group ({selectedIds.length})
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
