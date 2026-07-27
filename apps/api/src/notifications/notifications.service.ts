import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { eq, and, desc, count } from 'drizzle-orm';
import * as webpush from 'web-push';
import { DRIZZLE, Database } from '../database/database.module';
import { notifications, pushSubscriptions, users } from '../database/schema';
import { NotificationsGateway } from './notifications.gateway';
import {
  NotificationItem,
  NotificationType,
  NotificationSubscriptionInput,
  Paginated,
  UserRef,
} from '@task-tracker/shared';
import { Env } from '../config/env';

@Injectable()
export class NotificationsService implements OnModuleInit {
  private readonly logger = new Logger(NotificationsService.name);
  private isPushConfigured = false;
  private vapidPublicKey: string | null = null;

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly config: ConfigService<Env, true>,
    private readonly gateway: NotificationsGateway,
  ) {}

  onModuleInit() {
    const subject = this.config.get('VAPID_SUBJECT', { infer: true }) || 'mailto:admin@example.com';
    let publicKey = this.config.get('VAPID_PUBLIC_KEY', { infer: true });
    let privateKey = this.config.get('VAPID_PRIVATE_KEY', { infer: true });

    if (!publicKey || !privateKey) {
      const generated = webpush.generateVAPIDKeys();
      publicKey = generated.publicKey;
      privateKey = generated.privateKey;
      this.logger.log('Auto-generated temporary VAPID keys for development Web Push.');
    }

    try {
      webpush.setVapidDetails(subject, publicKey, privateKey);
      this.vapidPublicKey = publicKey;
      this.isPushConfigured = true;
      this.logger.log('Web Push VAPID details configured successfully.');
    } catch (err) {
      this.logger.error('Failed to configure Web Push VAPID details', (err as Error).stack);
    }
  }

  getVapidPublicKey(): { publicKey: string | null } {
    return { publicKey: this.vapidPublicKey };
  }

  async createNotification(
    userId: string,
    senderId: string | null,
    type: NotificationType,
    title: string,
    message: string,
    data?: Record<string, any>,
  ): Promise<NotificationItem> {
    const [inserted] = await this.db
      .insert(notifications)
      .values({
        userId,
        senderId,
        type,
        title,
        message,
        data: data ?? null,
      })
      .returning();

    if (!inserted) {
      throw new Error('Failed to create notification');
    }

    let sender: UserRef | null = null;
    if (senderId) {
      const [user] = await this.db
        .select({
          id: users.id,
          name: users.name,
          email: users.email,
          avatarKey: users.avatarKey,
        })
        .from(users)
        .where(eq(users.id, senderId))
        .limit(1);
      if (user) {
        sender = user;
      }
    }

    const notificationItem: NotificationItem = {
      id: inserted.id,
      userId: inserted.userId,
      sender,
      type: inserted.type as NotificationType,
      title: inserted.title,
      message: inserted.message,
      data: inserted.data as Record<string, any> | null,
      isRead: inserted.isRead,
      createdAt: inserted.createdAt.toISOString(),
    };

    // 1. Real-time WebSocket delivery
    this.gateway.sendNotificationToUser(userId, notificationItem);

    // 2. Web Push delivery
    if (this.isPushConfigured) {
      void this.sendWebPush(userId, {
        title: inserted.title,
        message: inserted.message,
        url: data?.taskId ? `/workspaces/${data.workspaceId}?task=${data.taskId}` : '/',
      });
    }

    return notificationItem;
  }

  private async sendWebPush(userId: string, payload: { title: string; message: string; url: string }) {
    const subscriptions = await this.db
      .select()
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.userId, userId));

    for (const sub of subscriptions) {
      try {
        const pushSubscription = {
          endpoint: sub.endpoint,
          keys: sub.keys as { p256dh: string; auth: string },
        };
        await webpush.sendNotification(pushSubscription, JSON.stringify(payload));
      } catch (err: any) {
        this.logger.warn(`Push failed for sub ${sub.id}: ${err.message}`);
        // Cleanup inactive / expired subscription (410 Gone / 404 Not Found)
        if (err.statusCode === 410 || err.statusCode === 404) {
          await this.db
            .delete(pushSubscriptions)
            .where(eq(pushSubscriptions.id, sub.id))
            .catch(() => undefined);
          this.logger.log(`Cleaned up expired push subscription: ${sub.id}`);
        }
      }
    }
  }

  async list(userId: string, page = 1, pageSize = 20): Promise<Paginated<NotificationItem>> {
    const offset = (page - 1) * pageSize;

    const [{ total } = { total: 0 }] = await this.db
      .select({ total: count() })
      .from(notifications)
      .where(eq(notifications.userId, userId));

    const rows = await this.db
      .select({
        notification: notifications,
        senderId: users.id,
        senderName: users.name,
        senderEmail: users.email,
        senderAvatarKey: users.avatarKey,
      })
      .from(notifications)
      .leftJoin(users, eq(users.id, notifications.senderId))
      .where(eq(notifications.userId, userId))
      .orderBy(desc(notifications.createdAt))
      .limit(pageSize)
      .offset(offset);

    const items = rows.map((r) => ({
      id: r.notification.id,
      userId: r.notification.userId,
      sender: r.senderId
        ? {
            id: r.senderId,
            name: r.senderName!,
            email: r.senderEmail!,
            avatarKey: r.senderAvatarKey,
          }
        : null,
      type: r.notification.type as NotificationType,
      title: r.notification.title,
      message: r.notification.message,
      data: r.notification.data as Record<string, any> | null,
      isRead: r.notification.isRead,
      createdAt: r.notification.createdAt.toISOString(),
    }));

    return {
      items,
      total: Number(total),
      page,
      pageSize,
    };
  }

  async getUnreadCount(userId: string): Promise<{ count: number }> {
    const [{ value } = { value: 0 }] = await this.db
      .select({ value: count() })
      .from(notifications)
      .where(
        and(
          eq(notifications.userId, userId),
          eq(notifications.isRead, false),
        ),
      );

    return { count: Number(value) };
  }

  async markAsRead(userId: string, id: string): Promise<NotificationItem> {
    const [updated] = await this.db
      .update(notifications)
      .set({ isRead: true })
      .where(
        and(
          eq(notifications.id, id),
          eq(notifications.userId, userId),
        ),
      )
      .returning();

    if (!updated) {
      throw new Error('Notification not found');
    }

    let sender: UserRef | null = null;
    if (updated.senderId) {
      const [user] = await this.db
        .select({
          id: users.id,
          name: users.name,
          email: users.email,
          avatarKey: users.avatarKey,
        })
        .from(users)
        .where(eq(users.id, updated.senderId))
        .limit(1);
      if (user) {
        sender = user;
      }
    }

    return {
      id: updated.id,
      userId: updated.userId,
      sender,
      type: updated.type as NotificationType,
      title: updated.title,
      message: updated.message,
      data: updated.data as Record<string, any> | null,
      isRead: updated.isRead,
      createdAt: updated.createdAt.toISOString(),
    };
  }

  async markAllAsRead(userId: string): Promise<void> {
    await this.db
      .update(notifications)
      .set({ isRead: true })
      .where(
        and(
          eq(notifications.userId, userId),
          eq(notifications.isRead, false),
        ),
      );
  }

  async addSubscription(userId: string, input: NotificationSubscriptionInput): Promise<void> {
    // Delete existing subscription for this endpoint if any (prevent duplicates)
    await this.db
      .delete(pushSubscriptions)
      .where(eq(pushSubscriptions.endpoint, input.endpoint));

    await this.db
      .insert(pushSubscriptions)
      .values({
        userId,
        endpoint: input.endpoint,
        keys: input.keys,
      });
  }

  async removeSubscription(userId: string, endpoint: string): Promise<void> {
    await this.db
      .delete(pushSubscriptions)
      .where(
        and(
          eq(pushSubscriptions.userId, userId),
          eq(pushSubscriptions.endpoint, endpoint),
        ),
      );
  }
}
