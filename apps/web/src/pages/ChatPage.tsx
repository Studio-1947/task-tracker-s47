import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ConversationList } from '../components/chat/ConversationList';
import { MessageThread } from '../components/chat/MessageThread';
import { NewChatModal } from '../components/chat/NewChatModal';
import { EmptyState } from '../components/ui';
import { useConversations } from '../hooks/useChat';

export function ChatPage() {
  const [params, setParams] = useSearchParams();
  const activeId = params.get('c');
  const [showNew, setShowNew] = useState(false);
  const { data: conversations, isLoading } = useConversations();

  const select = (id: string | null) => {
    const next = new URLSearchParams(params);
    if (id) next.set('c', id);
    else next.delete('c');
    setParams(next, { replace: false });
  };

  return (
    <div className="-my-2 h-[calc(100dvh-8.5rem)] md:h-[calc(100dvh-9rem)]">
      <div className="flex h-full overflow-hidden rounded-2xl border border-slate-100 bg-white dark:border-[#2d2d2d] dark:bg-[#181818]">
        <ConversationList
          conversations={conversations ?? []}
          isLoading={isLoading}
          activeId={activeId}
          onSelect={select}
          onNewChat={() => setShowNew(true)}
          className={`w-full border-r md:w-80 lg:w-96 ${activeId ? 'hidden md:flex' : 'flex'}`}
        />
        {activeId ? (
          <MessageThread
            key={activeId}
            conversationId={activeId}
            onBack={() => select(null)}
            className={`min-w-0 flex-1 ${activeId ? 'flex' : 'hidden md:flex'}`}
          />
        ) : (
          <div className="hidden flex-1 items-center justify-center p-8 md:flex">
            <EmptyState
              title="Your messages"
              hint="Pick a conversation on the left, or start a new one."
              icon={
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
              }
            />
          </div>
        )}
      </div>

      {showNew ? (
        <NewChatModal
          onClose={() => setShowNew(false)}
          onCreated={(id) => {
            setShowNew(false);
            select(id);
          }}
        />
      ) : null}
    </div>
  );
}
