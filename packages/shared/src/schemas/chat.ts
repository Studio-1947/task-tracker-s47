import { z } from 'zod';

/** One attachment reference, produced by POST /chat/attachments and echoed back
 * on the next message. Bytes already live on disk; the message just links them. */
export const chatAttachmentInputSchema = z.object({
  fileKey: z.string().min(1).max(255),
  fileName: z.string().min(1).max(255),
  mimeType: z.string().min(1).max(100),
  sizeBytes: z.number().int().nonnegative(),
});
export type ChatAttachmentInput = z.infer<typeof chatAttachmentInputSchema>;

export const MESSAGE_MAX_LEN = 4000;
/** Attachments per message. The composer enforces the same cap before uploading. */
export const MAX_MESSAGE_ATTACHMENTS = 10;

/** A message must carry a non-empty body OR at least one attachment. */
const messageContentRefine = (v: { body?: string; attachments?: unknown[] }) =>
  (v.body != null && v.body.trim().length > 0) || (v.attachments != null && v.attachments.length > 0);

export const sendMessageSchema = z
  .object({
    body: z.string().max(MESSAGE_MAX_LEN).optional(),
    attachments: z.array(chatAttachmentInputSchema).max(MAX_MESSAGE_ATTACHMENTS).optional(),
    mentionIds: z.array(z.string().uuid()).max(50).optional(),
    parentMessageId: z.string().uuid().nullable().optional(),
  })
  .refine(messageContentRefine, { message: 'A message needs text or an attachment', path: ['body'] });
export type SendMessageInput = z.infer<typeof sendMessageSchema>;

export const editMessageSchema = z.object({
  body: z.string().min(1).max(MESSAGE_MAX_LEN),
});
export type EditMessageInput = z.infer<typeof editMessageSchema>;

export const createDirectSchema = z.object({
  userId: z.string().uuid(),
});
export type CreateDirectInput = z.infer<typeof createDirectSchema>;

export const createGroupSchema = z.object({
  title: z.string().min(1).max(140),
  memberIds: z.array(z.string().uuid()).min(1).max(200),
});
export type CreateGroupInput = z.infer<typeof createGroupSchema>;

export const addMembersSchema = z.object({
  memberIds: z.array(z.string().uuid()).min(1).max(200),
});
export type AddMembersInput = z.infer<typeof addMembersSchema>;

export const markReadSchema = z.object({
  /** Mark read up to and including this message; omitted = mark all read now. */
  messageId: z.string().uuid().optional(),
});
export type MarkReadInput = z.infer<typeof markReadSchema>;

/* ── Socket event payload schemas (client → server) ── */

export const socketSendSchema = sendMessageSchema.and(
  z.object({ conversationId: z.string().uuid() }),
);
export type SocketSendInput = z.infer<typeof socketSendSchema>;

export const socketEditSchema = z.object({
  messageId: z.string().uuid(),
  body: z.string().min(1).max(MESSAGE_MAX_LEN),
});
export type SocketEditInput = z.infer<typeof socketEditSchema>;

export const socketDeleteSchema = z.object({ messageId: z.string().uuid() });
export type SocketDeleteInput = z.infer<typeof socketDeleteSchema>;

export const socketTypingSchema = z.object({ conversationId: z.string().uuid() });
export type SocketTypingInput = z.infer<typeof socketTypingSchema>;

export const socketReadSchema = z.object({
  conversationId: z.string().uuid(),
  messageId: z.string().uuid().optional(),
});
export type SocketReadInput = z.infer<typeof socketReadSchema>;

export const socketReactSchema = z.object({
  messageId: z.string().uuid(),
  emoji: z.string().min(1).max(16),
});
export type SocketReactInput = z.infer<typeof socketReactSchema>;
