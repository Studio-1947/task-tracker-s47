import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  PushSubscriptionInput,
  pushSubscriptionSchema,
} from '@task-tracker/shared';
import { CurrentUser, type RequestUser } from '../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { NotificationsService } from './notifications.service';

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  list(
    @CurrentUser() user: RequestUser,
    @Query('page') page: string | undefined,
    @Query('pageSize') pageSize: string | undefined,
  ) {
    const p = page ? Math.max(1, parseInt(page, 10)) : 1;
    const ps = pageSize ? Math.max(1, parseInt(pageSize, 10)) : 20;
    return this.notificationsService.list(user.id, p, ps);
  }

  @Get('vapid-public-key')
  getVapidPublicKey() {
    return this.notificationsService.getVapidPublicKey();
  }

  @Get('unread-count')
  getUnreadCount(@CurrentUser() user: RequestUser) {
    return this.notificationsService.getUnreadCount(user.id);
  }

  @Patch(':id/read')
  markAsRead(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: RequestUser) {
    return this.notificationsService.markAsRead(user.id, id);
  }

  @Post('read-all')
  async markAllAsRead(@CurrentUser() user: RequestUser) {
    await this.notificationsService.markAllAsRead(user.id);
    return { ok: true };
  }

  @Post('subscribe')
  async subscribe(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(pushSubscriptionSchema)) body: PushSubscriptionInput,
  ) {
    await this.notificationsService.addSubscription(user.id, body);
    return { ok: true };
  }

  @Post('unsubscribe')
  async unsubscribe(
    @CurrentUser() user: RequestUser,
    @Body('endpoint') endpoint: string,
  ) {
    if (!endpoint) {
      return { ok: false, error: 'Endpoint is required' };
    }
    await this.notificationsService.removeSubscription(user.id, endpoint);
    return { ok: true };
  }
}
