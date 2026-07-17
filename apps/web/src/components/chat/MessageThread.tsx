import { useEffect, useMemo, useRef, useState } from 'react';
import {
  MAX_MESSAGE_ATTACHMENTS,
  type ChatAttachmentInput,
  type ChatMessage,
  type ConversationMember,
} from '@task-tracker/shared';
import { apiBlob, ApiRequestError } from '../../lib/api';
import {
  ACCEPT_ATTACHMENT,
  ensureUploadableName,
  filesFromTransfer,
  MAX_UPLOAD_BYTES,
} from '../../lib/uploads';
import { useAuth } from '../../stores/auth';
import { useChatUi } from '../../stores/chat';
import { Avatar } from '../Avatar';
import { AuthImage } from '../AuthImage';
import { Spinner } from '../ui';
import {
  emitTyping,
  flattenMessages,
  useConversation,
  useDeleteMessage,
  useEditMessage,
  useMarkRead,
  useMessages,
  useSendMessage,
  useUploadChatFile,
} from '../../hooks/useChat';
import { ConversationInfo } from './ConversationInfo';
import { formatDayLabel, formatTime, GroupAvatar, PresenceDot, renderBody } from './helpers';

function isImage(mime: string): boolean {
  return mime.startsWith('image/');
}

/**
 * A staged attachment: already uploaded, but not yet attached to a message.
 *
 * `previewUrl` is a local object URL of the file the user picked. It can't come
 * from the server: GET /chat/attachments/:name authorizes via the message the
 * file belongs to, and until this is sent there is no such message — so the
 * server (correctly) 404s it.
 */
type PendingAttachment = ChatAttachmentInput & { previewUrl?: string };

async function downloadFile(fileKey: string, fileName: string): Promise<void> {
  const blob = await apiBlob(`/chat/${fileKey}`);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

function AttachmentView({ att }: { att: { fileKey: string; fileName: string; mimeType: string } }) {
  if (isImage(att.mimeType)) {
    return (
      <AuthImage
        path={`/chat/${att.fileKey}`}
        alt={att.fileName}
        className="mt-1 max-h-60 w-auto max-w-full cursor-pointer rounded-lg object-cover"
      />
    );
  }
  return (
    <button
      type="button"
      onClick={() => void downloadFile(att.fileKey, att.fileName)}
      className="mt-1 inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-[#2d2d2d] dark:bg-[#1e1e1e] dark:text-slate-200 dark:hover:bg-[#242424]"
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
      </svg>
      <span className="max-w-[12rem] truncate">{att.fileName}</span>
    </button>
  );
}

function MessageBubble({
  msg,
  mine,
  showSender,
  canDelete,
  memberNames,
  onEdit,
  onDelete,
}: {
  msg: ChatMessage;
  mine: boolean;
  showSender: boolean;
  canDelete: boolean;
  memberNames: string[];
  onEdit: (m: ChatMessage) => void;
  onDelete: (m: ChatMessage) => void;
}) {
  const deleted = !!msg.deletedAt;
  return (
    <div className={`group flex gap-2 ${mine ? 'flex-row-reverse' : 'flex-row'}`}>
      {!mine ? <Avatar user={msg.sender} size="sm" className="mt-auto" /> : null}
      <div className={`flex max-w-[78%] flex-col ${mine ? 'items-end' : 'items-start'}`}>
        {showSender && !mine ? (
          <span className="mb-0.5 px-1 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
            {msg.sender.name}
          </span>
        ) : null}
        <div
          className={`rounded-2xl px-3.5 py-2 text-sm break-words ${
            deleted
              ? 'bg-slate-100 italic text-slate-400 dark:bg-[#242424] dark:text-slate-500'
              : mine
                ? 'bg-gradient-to-br from-indigo-600 to-violet-600 text-white'
                : 'bg-slate-100 text-slate-800 dark:bg-[#2a2a2a] dark:text-slate-100'
          }`}
        >
          {deleted ? (
            'This message was deleted'
          ) : (
            <>
              {msg.body ? (
                <span className="whitespace-pre-wrap">{renderBody(msg.body, memberNames)}</span>
              ) : null}
              {msg.attachments.map((a) => (
                <AttachmentView key={a.id} att={a} />
              ))}
            </>
          )}
        </div>
        <div className={`mt-0.5 flex items-center gap-1.5 px-1 ${mine ? 'flex-row-reverse' : ''}`}>
          <span className="text-[10px] text-slate-400 dark:text-slate-500">{formatTime(msg.createdAt)}</span>
          {msg.editedAt && !deleted ? (
            <span className="text-[10px] text-slate-400 dark:text-slate-500">· edited</span>
          ) : null}
          {!deleted ? (
            <span className="hidden items-center gap-1.5 group-hover:flex">
              {mine && msg.body ? (
                <button
                  type="button"
                  onClick={() => onEdit(msg)}
                  className="text-[10px] font-medium text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400"
                >
                  Edit
                </button>
              ) : null}
              {canDelete ? (
                <button
                  type="button"
                  onClick={() => onDelete(msg)}
                  className="text-[10px] font-medium text-slate-400 hover:text-red-600 dark:hover:text-red-400"
                >
                  Delete
                </button>
              ) : null}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function MessageThread({
  conversationId,
  onBack,
  className = '',
}: {
  conversationId: string;
  onBack: () => void;
  className?: string;
}) {
  const myId = useAuth((s) => s.user?.id) ?? '';
  const online = useChatUi((s) => s.online);
  // NOTE: select the stored reference itself — returning `?? {}` here would build a
  // new object every render, so zustand would see a new snapshot each time and loop.
  const typingForConv = useChatUi((s) => s.typing[conversationId]);
  const setActive = useChatUi((s) => s.setActiveConversation);

  const { data: detail } = useConversation(conversationId);
  const messagesQuery = useMessages(conversationId);
  const messages = useMemo(() => flattenMessages(messagesQuery.data), [messagesQuery.data]);

  const send = useSendMessage(conversationId);
  const edit = useEditMessage();
  const del = useDeleteMessage(conversationId);
  const markRead = useMarkRead(conversationId);
  const upload = useUploadChatFile();

  const [text, setText] = useState('');
  const [editing, setEditing] = useState<ChatMessage | null>(null);
  const [pending, setPending] = useState<PendingAttachment[]>([]);
  const [mentionIds, setMentionIds] = useState<Record<string, string>>({}); // id → name
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [showInfo, setShowInfo] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const members: ConversationMember[] = detail?.members ?? [];
  const myMember = members.find((m) => m.user.id === myId);
  const canDeleteAny = detail?.type === 'GROUP' && myMember?.isAdmin;
  const lastMsg = messages[messages.length - 1];
  const memberNames = useMemo(() => members.map((m) => m.user.name), [members]);

  // Track the active conversation for unread/auto-read logic.
  useEffect(() => {
    setActive(conversationId);
    return () => setActive(null);
  }, [conversationId, setActive]);

  // Release staged image previews if the thread unmounts (e.g. switching
  // conversations) while attachments are still queued.
  const pendingRef = useRef(pending);
  pendingRef.current = pending;
  useEffect(
    () => () => {
      for (const a of pendingRef.current) if (a.previewUrl) URL.revokeObjectURL(a.previewUrl);
    },
    [],
  );

  // Mark read whenever the newest message changes while this thread is open.
  useEffect(() => {
    if (lastMsg) markRead.mutate(lastMsg.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId, lastMsg?.id]);

  // Keep pinned to the bottom when near it.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 200;
    if (nearBottom) el.scrollTop = el.scrollHeight;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.length]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (el && el.scrollTop < 60 && messagesQuery.hasNextPage && !messagesQuery.isFetchingNextPage) {
      void messagesQuery.fetchNextPage();
    }
  };

  const handleType = (value: string) => {
    setText(value);
    emitTyping(conversationId, true);
    if (typingTimer.current) clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => emitTyping(conversationId, false), 2500);
    const m = value.match(/@([\w.\-]*)$/);
    setMentionQuery(m ? m[1]!.toLowerCase() : null);
  };

  const mentionCandidates = useMemo(() => {
    if (mentionQuery === null) return [];
    return members
      .filter((m) => m.user.id !== myId && m.user.name.toLowerCase().includes(mentionQuery))
      .slice(0, 6);
  }, [mentionQuery, members, myId]);

  const pickMention = (m: ConversationMember) => {
    setText((t) => t.replace(/@([\w.\-]*)$/, `@${m.user.name} `));
    setMentionIds((prev) => ({ ...prev, [m.user.id]: m.user.name }));
    setMentionQuery(null);
  };

  const onSend = async () => {
    const body = text.trim();
    if (!body && pending.length === 0) return;
    const activeMentions = Object.entries(mentionIds)
      .filter(([, name]) => body.includes(`@${name}`))
      .map(([id]) => id);
    const sentAttachments = pending;
    setText('');
    setPending([]);
    setMentionIds({});
    setMentionQuery(null);
    setUploadError(null);
    emitTyping(conversationId, false);
    try {
      // previewUrl is client-only — send just the fields the API models.
      const attachments = sentAttachments.map(({ fileKey, fileName, mimeType, sizeBytes }) => ({
        fileKey,
        fileName,
        mimeType,
        sizeBytes,
      }));
      await send.mutateAsync({
        body: body || undefined,
        attachments: attachments.length ? attachments : undefined,
        mentionIds: activeMentions.length ? activeMentions : undefined,
      });
      // Sent: the thread now renders these from the server copy.
      for (const a of sentAttachments) if (a.previewUrl) URL.revokeObjectURL(a.previewUrl);
    } catch (err) {
      // Restore the whole draft — the attachments were cleared optimistically and
      // would otherwise be silently lost along with the failed send.
      setText(body);
      setPending(sentAttachments);
      setMentionIds(mentionIds);
      setUploadError(err instanceof ApiRequestError ? err.message : 'Message failed to send — try again.');
    }
  };

  const onSaveEdit = async () => {
    if (!editing) return;
    const body = text.trim();
    if (body) await edit.mutateAsync({ messageId: editing.id, body });
    setEditing(null);
    setText('');
  };

  const startEdit = (m: ChatMessage) => {
    setEditing(m);
    setText(m.body ?? '');
  };

  /**
   * Shared intake for the picker, paste and drop. Uploads immediately so the
   * pending tray can show a real thumbnail and sending stays instant.
   */
  const addFiles = async (files: File[]) => {
    if (files.length === 0) return;
    setUploadError(null);

    const room = MAX_MESSAGE_ATTACHMENTS - pending.length;
    if (room <= 0) {
      setUploadError(`You can attach up to ${MAX_MESSAGE_ATTACHMENTS} files per message.`);
      return;
    }
    const batch = files.slice(0, room);
    if (files.length > room) {
      setUploadError(`Only the first ${room} file(s) were attached — limit is ${MAX_MESSAGE_ATTACHMENTS} per message.`);
    }

    for (const raw of batch) {
      if (raw.size > MAX_UPLOAD_BYTES) {
        setUploadError(`"${raw.name}" is larger than 20 MB.`);
        continue;
      }
      const file = ensureUploadableName(raw);
      try {
        const saved = await upload.mutateAsync(file);
        setPending((p) => [
          ...p,
          { ...saved, previewUrl: isImage(file.type) ? URL.createObjectURL(file) : undefined },
        ]);
      } catch (err) {
        // Previously swallowed — a rejected upload looked like nothing happened.
        setUploadError(err instanceof ApiRequestError ? err.message : `Could not upload "${raw.name}"`);
      }
    }
    if (fileRef.current) fileRef.current.value = '';
  };

  const removePending = (index: number) =>
    setPending((p) => {
      const gone = p[index];
      if (gone?.previewUrl) URL.revokeObjectURL(gone.previewUrl);
      return p.filter((_, j) => j !== index);
    });

  /** Ctrl/Cmd+V of a screenshot or copied image. Text pastes fall through untouched. */
  const onPaste = (e: React.ClipboardEvent) => {
    const files = filesFromTransfer(e.clipboardData);
    if (files.length === 0) return;
    e.preventDefault(); // Otherwise the browser may also drop in a filename/markup.
    void addFiles(files);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    void addFiles(filesFromTransfer(e.dataTransfer));
  };

  const typingNames = useMemo(() => Object.values(typingForConv ?? {}), [typingForConv]);
  const otherMember = detail?.type === 'DIRECT' ? members.find((m) => m.user.id !== myId) : undefined;
  const seen =
    detail?.type === 'DIRECT' &&
    lastMsg &&
    lastMsg.sender.id === myId &&
    otherMember?.lastReadAt &&
    otherMember.lastReadAt >= lastMsg.createdAt;

  return (
    <div className={`flex flex-col ${className}`}>
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-slate-100 px-4 py-3 dark:border-[#2d2d2d]">
        <button
          type="button"
          onClick={onBack}
          className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-[#242424] md:hidden"
          aria-label="Back"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
        {detail ? (
          detail.type === 'DIRECT' && detail.otherUser ? (
            <div className="relative">
              <Avatar user={detail.otherUser} />
              <PresenceDot online={online.has(detail.otherUser.id)} className="absolute -bottom-0.5 -right-0.5" />
            </div>
          ) : (
            <GroupAvatar conv={detail} />
          )
        ) : null}
        <button
          type="button"
          disabled={!detail || detail.type === 'DIRECT'}
          onClick={() => setShowInfo(true)}
          className="min-w-0 flex-1 text-left disabled:cursor-default"
        >
          <div className="truncate text-sm font-bold text-slate-800 dark:text-white">{detail?.title ?? '…'}</div>
          <div className="truncate text-[11px] text-slate-400 dark:text-slate-500">
            {detail?.type === 'DIRECT'
              ? online.has(detail.otherUser?.id ?? '')
                ? 'Online'
                : 'Offline'
              : `${detail?.memberCount ?? 0} members · view`}
          </div>
        </button>
        {detail && detail.type !== 'DIRECT' ? (
          <button
            type="button"
            onClick={() => setShowInfo(true)}
            className="shrink-0 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-[#242424] dark:hover:text-slate-300"
            aria-label="Conversation members"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
          </button>
        ) : null}
      </div>

      {showInfo && detail ? <ConversationInfo detail={detail} onClose={() => setShowInfo(false)} /> : null}

      {/* Messages */}
      <div ref={scrollRef} onScroll={onScroll} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {messagesQuery.isLoading ? (
          <Spinner />
        ) : messages.length === 0 ? (
          <p className="py-10 text-center text-sm text-slate-400 dark:text-slate-500">
            No messages yet — say hello 👋
          </p>
        ) : (
          <>
            {messagesQuery.isFetchingNextPage ? (
              <p className="text-center text-[11px] text-slate-400">Loading earlier messages…</p>
            ) : null}
            {messages.map((m, i) => {
              const prev = messages[i - 1];
              const showDay = !prev || new Date(prev.createdAt).toDateString() !== new Date(m.createdAt).toDateString();
              const showSender = !prev || prev.sender.id !== m.sender.id || showDay;
              return (
                <div key={m.id} className="space-y-3">
                  {showDay ? (
                    <div className="flex justify-center">
                      <span className="rounded-full bg-slate-100 px-3 py-0.5 text-[10px] font-medium text-slate-500 dark:bg-[#242424] dark:text-slate-400">
                        {formatDayLabel(m.createdAt)}
                      </span>
                    </div>
                  ) : null}
                  <MessageBubble
                    msg={m}
                    mine={m.sender.id === myId}
                    showSender={detail?.type !== 'DIRECT' && showSender}
                    canDelete={m.sender.id === myId || !!canDeleteAny}
                    memberNames={memberNames}
                    onEdit={startEdit}
                    onDelete={(mm) => del.mutate(mm.id)}
                  />
                </div>
              );
            })}
            {seen ? <p className="pr-1 text-right text-[10px] text-slate-400 dark:text-slate-500">Seen</p> : null}
          </>
        )}
      </div>

      {/* Typing indicator */}
      {typingNames.length > 0 ? (
        <div className="px-4 pb-1 text-[11px] italic text-slate-400 dark:text-slate-500">
          {typingNames.length === 1 ? `${typingNames[0]} is typing…` : 'Several people are typing…'}
        </div>
      ) : null}

      {/* Composer */}
      <div
        className="relative border-t border-slate-100 px-3 py-3 dark:border-[#2d2d2d]"
        onDragOver={(e) => {
          // Only react to a real file drag, not text selection dragging.
          if (!e.dataTransfer.types.includes('Files')) return;
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={(e) => {
          if (e.currentTarget.contains(e.relatedTarget as Node)) return;
          setDragging(false);
        }}
        onDrop={onDrop}
      >
        {dragging ? (
          <div className="pointer-events-none absolute inset-1 z-10 flex items-center justify-center rounded-xl border-2 border-dashed border-indigo-400 bg-indigo-50/90 text-sm font-semibold text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-300">
            Drop to attach
          </div>
        ) : null}

        {mentionCandidates.length > 0 ? (
          <div className="absolute bottom-full left-3 mb-1 w-64 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg dark:border-[#2d2d2d] dark:bg-[#1e1e1e]">
            {mentionCandidates.map((m) => (
              <button
                key={m.user.id}
                type="button"
                onClick={() => pickMention(m)}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50 dark:hover:bg-[#242424]"
              >
                <Avatar user={m.user} size="sm" />
                <span className="truncate text-slate-700 dark:text-slate-200">{m.user.name}</span>
              </button>
            ))}
          </div>
        ) : null}

        {pending.length > 0 ? (
          <div className="mb-2 flex flex-wrap gap-2">
            {pending.map((a, i) => (
              <span
                key={a.fileKey}
                className="group/att relative inline-flex items-center gap-1.5 rounded-lg bg-slate-100 py-1 pl-1 pr-2 text-xs text-slate-600 dark:bg-[#242424] dark:text-slate-300"
              >
                {a.previewUrl ? (
                  <img src={a.previewUrl} alt={a.fileName} className="h-9 w-9 rounded object-cover" />
                ) : (
                  <span className="flex h-9 w-9 items-center justify-center rounded bg-slate-200 dark:bg-[#333]">📎</span>
                )}
                <span className="max-w-[8rem] truncate">{a.fileName}</span>
                <button
                  type="button"
                  onClick={() => removePending(i)}
                  className="text-slate-400 hover:text-red-500"
                  aria-label={`Remove ${a.fileName}`}
                >
                  ✕
                </button>
              </span>
            ))}
            {upload.isPending ? (
              <span className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-2.5 py-2 text-xs text-slate-500 dark:bg-[#242424] dark:text-slate-400">
                Uploading…
              </span>
            ) : null}
          </div>
        ) : upload.isPending ? (
          <p className="mb-2 text-xs text-slate-500 dark:text-slate-400">Uploading…</p>
        ) : null}

        {uploadError ? (
          <p className="mb-2 flex items-center justify-between gap-2 rounded-lg bg-red-50 px-3 py-1.5 text-xs font-medium text-red-600 dark:bg-red-950/20 dark:text-red-400">
            <span className="min-w-0 flex-1">{uploadError}</span>
            <button type="button" onClick={() => setUploadError(null)} aria-label="Dismiss error" className="shrink-0 font-bold">
              ✕
            </button>
          </p>
        ) : null}

        {editing ? (
          <div className="mb-2 flex items-center justify-between rounded-lg bg-amber-50 px-3 py-1.5 text-xs text-amber-700 dark:bg-amber-950/20 dark:text-amber-400">
            <span>Editing message</span>
            <button type="button" onClick={() => { setEditing(null); setText(''); }} className="font-semibold">
              Cancel
            </button>
          </div>
        ) : null}

        <div className="flex items-end gap-2">
          <input
            ref={fileRef}
            type="file"
            multiple
            accept={ACCEPT_ATTACHMENT}
            className="hidden"
            aria-label="Attach files"
            onChange={(e) => void addFiles(Array.from(e.target.files ?? []))}
          />
          {!editing ? (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={upload.isPending}
              className="shrink-0 rounded-lg p-2.5 text-slate-500 hover:bg-slate-100 disabled:opacity-50 dark:text-slate-400 dark:hover:bg-[#242424]"
              aria-label="Attach file"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
              </svg>
            </button>
          ) : null}
          <textarea
            value={text}
            onChange={(e) => handleType(e.target.value)}
            onPaste={editing ? undefined : onPaste}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void (editing ? onSaveEdit() : onSend());
              }
            }}
            onBlur={() => emitTyping(conversationId, false)}
            rows={1}
            placeholder={editing ? 'Edit your message…' : 'Type a message, or paste an image…'}
            className="max-h-32 min-h-[2.6rem] flex-1 resize-none rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 dark:border-[#2d2d2d] dark:bg-[#1a1a1a] dark:text-white"
          />
          <button
            type="button"
            onClick={() => void (editing ? onSaveEdit() : onSend())}
            disabled={send.isPending || (!text.trim() && pending.length === 0)}
            className="shrink-0 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 p-2.5 text-white transition-all hover:from-indigo-500 hover:to-violet-500 disabled:opacity-40"
            aria-label={editing ? 'Save' : 'Send'}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
