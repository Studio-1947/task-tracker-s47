import { useNavigate } from 'react-router-dom';
import { useConversations } from '../hooks/useChat';

/** Persistent entry point for chat, with the live unread total from the chat cache. */
export function ChatLauncher() {
  const navigate = useNavigate();
  const { data: conversations } = useConversations();
  const unread = (conversations ?? []).reduce((total, conversation) => total + conversation.unreadCount, 0);
  const label = unread ? `Open chat, ${unread > 99 ? '99 plus' : unread} unread message${unread === 1 ? '' : 's'}` : 'Open chat';

  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={() => navigate('/chat')}
      className="fixed bottom-5 right-5 z-40 grid h-14 w-14 place-items-center rounded-full bg-indigo-600 text-white shadow-lg shadow-indigo-950/25 transition duration-200 hover:-translate-y-0.5 hover:bg-indigo-700 hover:shadow-xl focus:outline-none focus:ring-4 focus:ring-indigo-300 dark:shadow-black/40 dark:focus:ring-indigo-900 sm:bottom-7 sm:right-7"
    >
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <path d="M21 15a2 2 0 0 1-2 2H8l-5 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
      {unread > 0 ? (
        <span className="absolute -right-1 -top-1 grid min-w-5 h-5 place-items-center rounded-full border-2 border-white bg-red-500 px-1 text-[10px] font-bold leading-none text-white dark:border-[#161616]">
          {unread > 99 ? '99+' : unread}
        </span>
      ) : null}
    </button>
  );
}
