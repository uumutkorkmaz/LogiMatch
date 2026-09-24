import { Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { notificationQuerySchema } from '@logimatch/shared';
import { createZodDto } from 'nestjs-zod';
import type { AuthActor } from '../common/actor';
import { CurrentActor } from '../common/decorators';
import { render } from './templates';
import { NotificationsService } from './notifications.service';

class NotificationQueryDto extends createZodDto(notificationQuerySchema) {}

@ApiTags('notifications')
@ApiBearerAuth()
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  async list(@CurrentActor() actor: AuthActor, @Query() q: NotificationQueryDto) {
    const rows = await this.notifications.list(actor.userId, q);
    const hasMore = rows.length > q.limit;
    const items = (hasMore ? rows.slice(0, q.limit) : rows).map((n) => ({
      ...n,
      ...render(n.template, 'tr', n.payload as Record<string, unknown>),
    }));
    return {
      items,
      nextCursor: hasMore ? (items.at(-1)?.id ?? null) : null,
      unread: await this.notifications.unreadCount(actor.userId),
    };
  }

  @Post(':id/read')
  @HttpCode(204)
  async read(@CurrentActor() actor: AuthActor, @Param('id', ParseUUIDPipe) id: string) {
    await this.notifications.markRead(actor.userId, id);
  }

  @Post('read-all')
  @HttpCode(204)
  async readAll(@CurrentActor() actor: AuthActor) {
    await this.notifications.markAllRead(actor.userId);
  }
}
