import { Controller, Get, Param, ParseUUIDPipe, Patch } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../../../common/decorators';
import { PendingApi } from '../../../common/openapi/pending-api';
import type { Actor } from '../../../common/types/actor';

@ApiTags('notifications')
@ApiBearerAuth()
@ApiResponse({ status: 501, description: 'Contract only' })
@Controller('notifications')
export class NotificationsController extends PendingApi {
  @Get()
  @ApiOperation({ summary: 'List current user notifications' })
  list(@CurrentUser() _actor: Actor) {
    return this.pending();
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Count unread current-user notifications' })
  unreadCount(@CurrentUser() _actor: Actor) {
    return this.pending();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get current-user notification' })
  get(@CurrentUser() _actor: Actor, @Param('id', ParseUUIDPipe) _id: string) {
    return this.pending();
  }

  @Patch(':id/read')
  @ApiOperation({ summary: 'Mark notification as read' })
  markRead(
    @CurrentUser() _actor: Actor,
    @Param('id', ParseUUIDPipe) _id: string,
  ) {
    return this.pending();
  }

  @Patch('read-all')
  @ApiOperation({ summary: 'Mark all current-user notifications as read' })
  markAllRead(@CurrentUser() _actor: Actor) {
    return this.pending();
  }
}
