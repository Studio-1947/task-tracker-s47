import { create } from 'zustand';

/** Ephemeral realtime chat state (presence + typing + connection). Message data
 * itself lives in React Query; this store holds only transient socket signals. */
interface ChatUiState {
  connected: boolean;
  /** User ids currently online. */
  online: Set<string>;
  /** conversationId → (userId → display name) of people currently typing. */
  typing: Record<string, Record<string, string>>;
  /** The conversation the user is currently viewing (drives auto-read + unread). */
  activeConversationId: string | null;

  setConnected: (connected: boolean) => void;
  setPresence: (userId: string, online: boolean) => void;
  setTyping: (conversationId: string, userId: string, name: string, typing: boolean) => void;
  clearTyping: (conversationId: string, userId: string) => void;
  setActiveConversation: (id: string | null) => void;
}

export const useChatUi = create<ChatUiState>((set) => ({
  connected: false,
  online: new Set(),
  typing: {},
  activeConversationId: null,

  setConnected: (connected) => set({ connected }),

  setPresence: (userId, online) =>
    set((s) => {
      const next = new Set(s.online);
      if (online) next.add(userId);
      else next.delete(userId);
      return { online: next };
    }),

  setTyping: (conversationId, userId, name, typing) =>
    set((s) => {
      const forConv = { ...(s.typing[conversationId] ?? {}) };
      if (typing) forConv[userId] = name;
      else delete forConv[userId];
      return { typing: { ...s.typing, [conversationId]: forConv } };
    }),

  clearTyping: (conversationId, userId) =>
    set((s) => {
      const forConv = { ...(s.typing[conversationId] ?? {}) };
      delete forConv[userId];
      return { typing: { ...s.typing, [conversationId]: forConv } };
    }),

  setActiveConversation: (id) => set({ activeConversationId: id }),
}));
