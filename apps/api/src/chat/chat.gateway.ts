import { Logger } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Namespace, Socket } from 'socket.io';
import {
  socketDeleteSchema,
  socketEditSchema,
  socketReadSchema,
  socketSendSchema,
  socketTypingSchema,
  type ChatMessage,
} from '@task-tracker/shared';
import { AuthService } from '../auth/auth.service';
import { ChatService } from './chat.service';

type Actor = { id: string; role: string };

function userRoom(userId: string): string {
  return `user:${userId}`;
}
function convRoom(conversationId: string): string {
  return `conv:${conversationId}`;
}

/**
 * Realtime chat transport. Auth is a JWT access token passed in the handshake
 * (`auth.token`) — the same token the REST client holds in memory — verified with
 * AuthService. Each socket joins a personal room (`user:<id>`) plus a room per
 * conversation it belongs to (`conv:<id>`); all fan-out is room-scoped.
 *
 * Served at the default socket.io path (`/socket.io`, NOT under the `/api` prefix),
 * namespace `/chat`. The web dev proxy and prod nginx must upgrade `/socket.io`.
 */
@WebSocketGateway({ namespace: '/chat', cors: { origin: true, credentials: true } })
export class ChatGateway implements OnGatewayInit, OnGatewayDisconnect {
  private readonly logger = new Logger(ChatGateway.name);
  /** Live connection count per user, for presence online/offline edges. */
  private readonly connections = new Map<string, number>();

  @WebSocketServer() server!: Namespace;

  constructor(
    private readonly auth: AuthService,
    private readonly chat: ChatService,
  ) {}

  private actorOf(socket: Socket): Actor {
    return { id: socket.data.userId as string, role: socket.data.role as string };
  }

  /**
   * Authenticate + wire up rooms in namespace middleware, which runs DURING the
   * handshake and blocks the client's `connect` event until it resolves. Doing
   * this in handleConnection instead would race: socket.io fires `connect` before
   * the async handler finishes, so an immediate message would see no identity.
   */
  afterInit(server: Namespace): void {
    server.use(async (socket: Socket, next: (err?: Error) => void) => {
      try {
        const token =
          (socket.handshake.auth?.token as string | undefined) ??
          socket.handshake.headers.authorization?.replace(/^Bearer\s+/i, '');
        if (!token) throw new Error('No token');
        const user = await this.auth.verifyAccessToken(token);
        const ref = await this.chat.getUserRef(user.id);
        socket.data.userId = user.id;
        socket.data.role = user.role;
        socket.data.name = ref?.name ?? 'Someone';

        const convIds = await this.chat.listConversationIds(user.id);
        socket.join(userRoom(user.id));
        for (const id of convIds) socket.join(convRoom(id));

        const count = (this.connections.get(user.id) ?? 0) + 1;
        this.connections.set(user.id, count);
        if (count === 1) this.emitPresenceToConversations(user.id, convIds, true);
        next();
      } catch (err) {
        this.logger.debug(`Rejected socket ${socket.id}: ${(err as Error).message}`);
        next(new Error('unauthorized'));
      }
    });
  }

  async handleDisconnect(socket: Socket): Promise<void> {
    const userId = socket.data.userId as string | undefined;
    if (!userId) return;
    const next = (this.connections.get(userId) ?? 1) - 1;
    if (next <= 0) {
      this.connections.delete(userId);
      const convIds = await this.chat.listConversationIds(userId);
      this.emitPresenceToConversations(userId, convIds, false);
    } else {
      this.connections.set(userId, next);
    }
  }

  private emitPresenceToConversations(userId: string, convIds: string[], online: boolean): void {
    for (const id of convIds) {
      this.server.to(convRoom(id)).emit('presence', { userId, online });
    }
  }

  /* ── Client → server ── */

  @SubscribeMessage('message:send')
  async onSend(@ConnectedSocket() socket: Socket, @MessageBody() payload: unknown) {
    const parsed = socketSendSchema.safeParse(payload);
    if (!parsed.success) return { ok: false, error: 'Invalid payload' };
    const { conversationId, ...input } = parsed.data;
    try {
      const message = await this.chat.sendMessage(this.actorOf(socket), conversationId, input);
      this.broadcastNewMessage(message);
      return { ok: true, message };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  }

  @SubscribeMessage('message:edit')
  async onEdit(@ConnectedSocket() socket: Socket, @MessageBody() payload: unknown) {
    const parsed = socketEditSchema.safeParse(payload);
    if (!parsed.success) return { ok: false, error: 'Invalid payload' };
    try {
      const message = await this.chat.editMessage(this.actorOf(socket), parsed.data.messageId, parsed.data.body);
      this.broadcastUpdatedMessage(message);
      return { ok: true, message };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  }

  @SubscribeMessage('message:delete')
  async onDelete(@ConnectedSocket() socket: Socket, @MessageBody() payload: unknown) {
    const parsed = socketDeleteSchema.safeParse(payload);
    if (!parsed.success) return { ok: false, error: 'Invalid payload' };
    try {
      const { conversationId } = await this.chat.deleteMessage(this.actorOf(socket), parsed.data.messageId);
      this.broadcastDeletedMessage(conversationId, parsed.data.messageId);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  }

  @SubscribeMessage('read')
  async onRead(@ConnectedSocket() socket: Socket, @MessageBody() payload: unknown) {
    const parsed = socketReadSchema.safeParse(payload);
    if (!parsed.success) return { ok: false, error: 'Invalid payload' };
    try {
      const actor = this.actorOf(socket);
      const { lastReadAt } = await this.chat.markRead(actor, parsed.data.conversationId, parsed.data.messageId);
      this.broadcastRead(parsed.data.conversationId, actor.id, lastReadAt);
      return { ok: true, lastReadAt };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  }

  @SubscribeMessage('typing:start')
  async onTypingStart(@ConnectedSocket() socket: Socket, @MessageBody() payload: unknown) {
    return this.handleTyping(socket, payload, true);
  }

  @SubscribeMessage('typing:stop')
  async onTypingStop(@ConnectedSocket() socket: Socket, @MessageBody() payload: unknown) {
    return this.handleTyping(socket, payload, false);
  }

  private async handleTyping(socket: Socket, payload: unknown, typing: boolean) {
    const parsed = socketTypingSchema.safeParse(payload);
    if (!parsed.success) return { ok: false };
    try {
      await this.chat.assertCanAccess(parsed.data.conversationId, this.actorOf(socket));
      socket.to(convRoom(parsed.data.conversationId)).emit('typing', {
        conversationId: parsed.data.conversationId,
        userId: socket.data.userId as string,
        userName: socket.data.name as string,
        typing,
      });
      return { ok: true };
    } catch {
      return { ok: false };
    }
  }

  /* ── Server → client (also called by the REST controller) ── */

  broadcastNewMessage(message: ChatMessage): void {
    this.server.to(convRoom(message.conversationId)).emit('message:new', {
      conversationId: message.conversationId,
      message,
    });
    for (const userId of message.mentionIds) {
      this.server.to(userRoom(userId)).emit('mention', { conversationId: message.conversationId, message });
    }
  }

  broadcastUpdatedMessage(message: ChatMessage): void {
    this.server.to(convRoom(message.conversationId)).emit('message:update', {
      conversationId: message.conversationId,
      message,
    });
  }

  broadcastDeletedMessage(conversationId: string, messageId: string): void {
    this.server.to(convRoom(conversationId)).emit('message:delete', { conversationId, messageId });
  }

  broadcastRead(conversationId: string, userId: string, lastReadAt: string): void {
    this.server.to(convRoom(conversationId)).emit('read', { conversationId, userId, lastReadAt });
  }

  /** Join a user's live sockets to a conversation room (e.g. after they open a project channel). */
  joinUserToConversation(userId: string, conversationId: string): void {
    this.server.in(userRoom(userId)).socketsJoin(convRoom(conversationId));
  }

  removeUserFromConversation(userId: string, conversationId: string): void {
    this.server.in(userRoom(userId)).socketsLeave(convRoom(conversationId));
  }

  /** Join members' sockets to a new conversation and push each a personalised summary. */
  async notifyConversationCreated(memberIds: string[], conversationId: string): Promise<void> {
    for (const userId of memberIds) {
      this.server.in(userRoom(userId)).socketsJoin(convRoom(conversationId));
      try {
        const conversation = await this.chat.getConversationSummary(conversationId, userId);
        this.server.to(userRoom(userId)).emit('conversation:new', { conversation });
      } catch {
        /* user may have no live socket; ignore */
      }
    }
  }
}
