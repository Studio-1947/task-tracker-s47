import { useEffect, useRef } from 'react';
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
  type QueryClient,
} from '@tanstack/react-query';
import type {
  ChatAttachmentInput,
  ChatContact,
  ChatMessage,
  ConversationDetail,
  ConversationSummary,
  MessageDeletedEvent,
  MessageEvent,
  PresenceEvent,
  ReadEvent,
  SendMessageInput,
  TypingEvent,
} from '@task-tracker/shared';
import { http } from '../lib/api';
import { connectSocket, emitAck, getSocket } from '../lib/socket';
import { useAuth } from '../stores/auth';
import { useChatUi } from '../stores/chat';

export interface MessagesPage {
  items: ChatMessage[];
  hasMore: boolean;
  nextBefore: string | null;
}
type MessagesData = InfiniteData<MessagesPage>;

const keys = {
  conversations: ['chat', 'conversations'] as const,
  conversation: (id: string) => ['chat', 'conversation', id] as const,
  messages: (id: string) => ['chat', 'messages', id] as const,
  contacts: (q: string) => ['chat', 'contacts', q] as const,
};

/* ── Queries ── */

export function useConversations() {
  return useQuery({
    queryKey: keys.conversations,
    queryFn: () => http.get<ConversationSummary[]>('/chat/conversations'),
  });
}

export function useConversation(id: string | null) {
  return useQuery({
    queryKey: id ? keys.conversation(id) : ['chat', 'conversation', 'none'],
    queryFn: () => http.get<ConversationDetail>(`/chat/conversations/${id}`),
    enabled: !!id,
  });
}

export function useMessages(conversationId: string | null) {
  return useInfiniteQuery({
    queryKey: conversationId ? keys.messages(conversationId) : ['chat', 'messages', 'none'],
    queryFn: ({ pageParam }) =>
      http.get<MessagesPage>(
        `/chat/conversations/${conversationId}/messages${pageParam ? `?before=${pageParam}` : ''}`,
      ),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextBefore ?? undefined,
    enabled: !!conversationId,
  });
}

/** Flatten infinite pages (page 0 = newest batch) into ascending chronological order. */
export function flattenMessages(data: MessagesData | undefined): ChatMessage[] {
  if (!data) return [];
  return data.pages.slice().reverse().flatMap((p) => p.items);
}

export function useContacts(q: string) {
  return useQuery({
    queryKey: keys.contacts(q),
    queryFn: () => http.get<ChatContact[]>(`/chat/contacts${q ? `?q=${encodeURIComponent(q)}` : ''}`),
  });
}

/* ── Cache helpers ── */

function upsertMessage(qc: QueryClient, msg: ChatMessage): void {
  qc.setQueryData<MessagesData>(keys.messages(msg.conversationId), (data) => {
    if (!data) return data;
    const exists = data.pages.some((p) => p.items.some((m) => m.id === msg.id));
    if (exists) {
      return {
        ...data,
        pages: data.pages.map((p) => ({
          ...p,
          items: p.items.map((m) => (m.id === msg.id ? msg : m)),
        })),
      };
    }
    // New message → append to the newest page (page 0, items ascending).
    const pages = data.pages.slice();
    pages[0] = { ...pages[0]!, items: [...pages[0]!.items, msg] };
    return { ...data, pages };
  });
}

function markDeleted(qc: QueryClient, conversationId: string, messageId: string): void {
  qc.setQueryData<MessagesData>(keys.messages(conversationId), (data) => {
    if (!data) return data;
    return {
      ...data,
      pages: data.pages.map((p) => ({
        ...p,
        items: p.items.map((m) =>
          m.id === messageId
            ? { ...m, body: null, attachments: [], mentionIds: [], deletedAt: new Date().toISOString() }
            : m,
        ),
      })),
    };
  });
}

function bumpConversation(qc: QueryClient, msg: ChatMessage, myId: string, activeId: string | null): void {
  let found = false;
  qc.setQueryData<ConversationSummary[]>(keys.conversations, (list) => {
    if (!list) return list;
    const next = list.map((c) => {
      if (c.id !== msg.conversationId) return c;
      found = true;
      const isMine = msg.sender.id === myId;
      const isActive = activeId === c.id;
      return {
        ...c,
        lastMessageAt: msg.createdAt,
        lastMessage: {
          body: msg.body,
          senderId: msg.sender.id,
          senderName: msg.sender.name,
          hasAttachment: msg.attachments.length > 0,
          createdAt: msg.createdAt,
        },
        unreadCount: isMine || isActive ? c.unreadCount : c.unreadCount + 1,
      };
    });
    // Move the touched conversation to the top.
    next.sort((a, b) => (b.lastMessageAt ?? '').localeCompare(a.lastMessageAt ?? ''));
    return next;
  });
  if (!found) void qc.invalidateQueries({ queryKey: keys.conversations });
}

/* ── Mutations ── */

export function useSendMessage(conversationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: SendMessageInput): Promise<ChatMessage> => {
      const socket = getSocket();
      if (socket.connected) {
        const res = await emitAck<{ ok: boolean; message?: ChatMessage; error?: string }>('message:send', {
          conversationId,
          ...input,
        });
        if (!res.ok || !res.message) throw new Error(res.error ?? 'Failed to send');
        return res.message;
      }
      return http.post<ChatMessage>(`/chat/conversations/${conversationId}/messages`, input);
    },
    onSuccess: (msg) => upsertMessage(qc, msg),
  });
}

export function useEditMessage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ messageId, body }: { messageId: string; body: string }): Promise<ChatMessage> => {
      const socket = getSocket();
      if (socket.connected) {
        const res = await emitAck<{ ok: boolean; message?: ChatMessage; error?: string }>('message:edit', {
          messageId,
          body,
        });
        if (!res.ok || !res.message) throw new Error(res.error ?? 'Failed to edit');
        return res.message;
      }
      return http.patch<ChatMessage>(`/chat/messages/${messageId}`, { body });
    },
    onSuccess: (msg) => upsertMessage(qc, msg),
  });
}

export function useDeleteMessage(conversationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (messageId: string): Promise<string> => {
      const socket = getSocket();
      if (socket.connected) {
        const res = await emitAck<{ ok: boolean; error?: string }>('message:delete', { messageId });
        if (!res.ok) throw new Error(res.error ?? 'Failed to delete');
      } else {
        await http.del(`/chat/messages/${messageId}`);
      }
      return messageId;
    },
    onSuccess: (messageId) => markDeleted(qc, conversationId, messageId),
  });
}

export function useToggleReaction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ messageId, emoji }: { messageId: string; emoji: string }): Promise<ChatMessage> => {
      const socket = getSocket();
      if (socket.connected) {
        const res = await emitAck<{ ok: boolean; message?: ChatMessage; error?: string }>('message:react', {
          messageId,
          emoji,
        });
        if (!res.ok || !res.message) throw new Error(res.error ?? 'Failed to toggle reaction');
        return res.message;
      }
      return http.post<ChatMessage>(`/chat/messages/${messageId}/react`, { emoji });
    },
    onSuccess: (msg) => upsertMessage(qc, msg),
  });
}

export function useMarkRead(conversationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (messageId?: string) => {
      const socket = getSocket();
      if (socket.connected) {
        await emitAck('read', { conversationId, messageId });
      } else {
        await http.post(`/chat/conversations/${conversationId}/read`, { messageId });
      }
    },
    onSuccess: () => {
      qc.setQueryData<ConversationSummary[]>(keys.conversations, (list) =>
        list?.map((c) => (c.id === conversationId ? { ...c, unreadCount: 0 } : c)),
      );
    },
  });
}

export function useCreateDirect() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => http.post<ConversationSummary>('/chat/conversations/direct', { userId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.conversations }),
  });
}

export function useCreateGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { title: string; memberIds: string[] }) =>
      http.post<ConversationSummary>('/chat/conversations/group', input),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.conversations }),
  });
}

export function useEnsureProjectConversation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (projectId: string) =>
      http.post<ConversationSummary>(`/chat/projects/${projectId}/conversation`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.conversations }),
  });
}

export function useAddGroupMembers(conversationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (memberIds: string[]) =>
      http.post<ConversationDetail>(`/chat/conversations/${conversationId}/members`, { memberIds }),
    onSuccess: (detail) => {
      qc.setQueryData(keys.conversation(conversationId), detail);
      void qc.invalidateQueries({ queryKey: keys.conversations });
    },
  });
}

export function useRemoveGroupMember(conversationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) =>
      http.del(`/chat/conversations/${conversationId}/members/${userId}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.conversation(conversationId) });
      void qc.invalidateQueries({ queryKey: keys.conversations });
    },
  });
}

export function useUploadChatFile() {
  return useMutation({
    mutationFn: (file: File) => {
      const form = new FormData();
      form.append('file', file);
      return http.upload<ChatAttachmentInput>('/chat/attachments', form);
    },
  });
}

/* ── Realtime socket bridge (mount once) ── */

export function useChatBridge(): void {
  const qc = useQueryClient();
  const status = useAuth((s) => s.status);
  const myId = useAuth((s) => s.user?.id) ?? '';
  const ui = useChatUi;

  // Keep the latest ids readable inside stable socket listeners.
  const myIdRef = useRef(myId);
  myIdRef.current = myId;

  useEffect(() => {
    if (status !== 'authenticated') return;
    const socket = getSocket();
    connectSocket();

    const onConnect = () => ui.getState().setConnected(true);
    const onDisconnect = (reason: string) => {
      ui.getState().setConnected(false);
      // A server-side auth rejection is terminal for the client; retry with a
      // (possibly refreshed) token shortly.
      if (reason === 'io server disconnect') setTimeout(() => connectSocket(), 800);
    };
    const onMessageNew = ({ message }: MessageEvent) => {
      upsertMessage(qc, message);
      bumpConversation(qc, message, myIdRef.current, ui.getState().activeConversationId);
      ui.getState().clearTyping(message.conversationId, message.sender.id);
    };
    const onMessageUpdate = ({ message }: MessageEvent) => upsertMessage(qc, message);
    const onMessageDelete = ({ conversationId, messageId }: MessageDeletedEvent) =>
      markDeleted(qc, conversationId, messageId);
    const onTyping = ({ conversationId, userId, userName, typing }: TypingEvent) => {
      if (userId === myIdRef.current) return;
      ui.getState().setTyping(conversationId, userId, userName, typing);
    };
    const onRead = ({ conversationId, userId, lastReadAt }: ReadEvent) => {
      qc.setQueryData<ConversationDetail>(keys.conversation(conversationId), (d) =>
        d
          ? { ...d, members: d.members.map((m) => (m.user.id === userId ? { ...m, lastReadAt } : m)) }
          : d,
      );
    };
    const onPresence = ({ userId, online }: PresenceEvent) => ui.getState().setPresence(userId, online);
    const onConversationNew = () => void qc.invalidateQueries({ queryKey: keys.conversations });
    const onMention = () => void qc.invalidateQueries({ queryKey: keys.conversations });

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('message:new', onMessageNew);
    socket.on('message:update', onMessageUpdate);
    socket.on('message:delete', onMessageDelete);
    socket.on('typing', onTyping);
    socket.on('read', onRead);
    socket.on('presence', onPresence);
    socket.on('conversation:new', onConversationNew);
    socket.on('mention', onMention);
    if (socket.connected) onConnect();

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('message:new', onMessageNew);
      socket.off('message:update', onMessageUpdate);
      socket.off('message:delete', onMessageDelete);
      socket.off('typing', onTyping);
      socket.off('read', onRead);
      socket.off('presence', onPresence);
      socket.off('conversation:new', onConversationNew);
      socket.off('mention', onMention);
    };
  }, [status, qc, ui]);
}

/** Throttled typing emitter for the composer. */
export function emitTyping(conversationId: string, typing: boolean): void {
  const socket = getSocket();
  if (socket.connected) socket.emit(typing ? 'typing:start' : 'typing:stop', { conversationId });
}
