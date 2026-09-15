import { Controller, Get, Param, Patch } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { PendingApi } from '../../../common/openapi/pending-api';

@ApiTags('notifications')
@ApiBearerAuth()
@ApiResponse({ status: 501, description: 'Contract only' })
@Controller('notifications')
export class NotificationsController extends PendingApi {
  @Get()
  @ApiOperation({ summary: 'List current user notifications' })
  list() {
    return this.pending();
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Count unread current-user notifications' })
  unreadCount() {
    return this.pending();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get current-user notification' })
  get(@Param('id') _id: string) {
    return this.pending();
  }

  @Patch(':id/read')
  @ApiOperation({ summary: 'Mark notification as read' })
  markRead(@Param('id') _id: string) {
    return this.pending();
  }

  @Patch('read-all')
  @ApiOperation({ summary: 'Mark all current-user notifications as read' })
  markAllRead() {
    return this.pending();
  }
}
