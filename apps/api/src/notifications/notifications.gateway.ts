import { Injectable } from '@nestjs/common';
import { WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Namespace } from 'socket.io';
import { NotificationItem } from '@task-tracker/shared';

@Injectable()
@WebSocketGateway({ namespace: '/chat', cors: { origin: true, credentials: true } })
export class NotificationsGateway {
  @WebSocketServer() server!: Namespace;

  sendNotificationToUser(userId: string, notification: NotificationItem): void {
    if (this.server) {
      this.server.to(`user:${userId}`).emit('notification:new', { notification });
    }
  }
}
