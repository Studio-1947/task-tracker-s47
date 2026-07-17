import type { ConversationSummary } from '@task-tracker/shared';
import { Avatar } from '../Avatar';
import { Spinner } from '../ui';
import { useChatUi } from '../../stores/chat';
import { formatConvTime, GroupAvatar, PresenceDot } from './helpers';

function previewText(conv: ConversationSummary): string {
  const m = conv.lastMessage;
  if (!m) return 'No messages yet';
  const who = conv.type !== 'DIRECT' ? `${m.senderName.split(' ')[0]}: ` : '';
  if (m.body) return who + m.body;
  if (m.hasAttachment) return `${who}📎 Attachment`;
  return `${who}Message deleted`;
}

export function ConversationList({
  conversations,
  isLoading,
  activeId,
  onSelect,
  onNewChat,
  className = '',
}: {
  conversations: ConversationSummary[];
  isLoading: boolean;
  activeId: string | null;
  onSelect: (id: string) => void;
  onNewChat: () => void;
  className?: string;
}) {
  const online = useChatUi((s) => s.online);

  return (
    <div className={`flex flex-col border-slate-100 dark:border-[#2d2d2d] ${className}`}>
      <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-3.5 dark:border-[#2d2d2d]">
        <h2 className="text-sm font-bold text-slate-800 dark:text-white">Messages</h2>
        <button
          type="button"
          onClick={onNewChat}
          className="inline-flex items-center gap-1 rounded-lg bg-indigo-50 px-2.5 py-1.5 text-xs font-semibold text-indigo-600 hover:bg-indigo-100 dark:bg-indigo-950/30 dark:text-indigo-400 dark:hover:bg-indigo-950/50 transition-colors"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
            <path d="M12 5v14M5 12h14" strokeLinecap="round" />
          </svg>
          New
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <Spinner />
        ) : conversations.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-slate-400 dark:text-slate-500">
            No conversations yet. Start one with “New”.
          </p>
        ) : (
          conversations.map((c) => {
            const isActive = c.id === activeId;
            const isOnline = c.type === 'DIRECT' && c.otherUser ? online.has(c.otherUser.id) : false;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => onSelect(c.id)}
                className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-colors ${
                  isActive
                    ? 'bg-indigo-50/60 dark:bg-indigo-950/20'
                    : 'hover:bg-slate-50 dark:hover:bg-[#242424]'
                }`}
              >
                <div className="relative shrink-0">
                  {c.type === 'DIRECT' && c.otherUser ? (
                    <Avatar user={c.otherUser} />
                  ) : (
                    <GroupAvatar conv={c} />
                  )}
                  {c.type === 'DIRECT' ? (
                    <PresenceDot online={isOnline} className="absolute -bottom-0.5 -right-0.5" />
                  ) : null}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">
                      {c.title}
                    </span>
                    <span className="shrink-0 text-[11px] text-slate-400 dark:text-slate-500">
                      {formatConvTime(c.lastMessageAt)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={`truncate text-xs ${
                        c.unreadCount > 0
                          ? 'font-medium text-slate-700 dark:text-slate-200'
                          : 'text-slate-400 dark:text-slate-500'
                      }`}
                    >
                      {previewText(c)}
                    </span>
                    {c.unreadCount > 0 ? (
                      <span className="shrink-0 rounded-full bg-indigo-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
                        {c.unreadCount > 99 ? '99+' : c.unreadCount}
                      </span>
                    ) : null}
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
