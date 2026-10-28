import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../../../common/decorators';
import type { Actor } from '../../../common/types/actor';
import {
  NotificationListQueryDto,
  NotificationPageResponseDto,
  NotificationResponseDto,
  NotificationMarkAllReadResponseDto,
  NotificationUnreadCountResponseDto,
} from '../dto';
import { NotificationInboxService } from './inbox.service';

@ApiTags('notifications')
@ApiBearerAuth()
@Controller('notifications')
export class NotificationInboxController {
  constructor(private readonly inbox: NotificationInboxService) {}

  @Get()
  @ApiOperation({
    summary: 'List current user notifications',
    description:
      'Mới nhất trước, phân trang bằng cursor (nextCursor của trang trước). Cursor sai định dạng: 400.',
  })
  @ApiOkResponse({ type: NotificationPageResponseDto })
  list(
    @CurrentUser() actor: Actor,
    @Query() query: NotificationListQueryDto,
  ): Promise<NotificationPageResponseDto> {
    return this.inbox.list(actor, query);
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Count unread current-user notifications' })
  @ApiOkResponse({ type: NotificationUnreadCountResponseDto })
  unreadCount(
    @CurrentUser() actor: Actor,
  ): Promise<NotificationUnreadCountResponseDto> {
    return this.inbox.unreadCount(actor);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get current-user notification',
    description: 'Không có hoặc thuộc người khác: 404.',
  })
  @ApiOkResponse({ type: NotificationResponseDto })
  get(
    @CurrentUser() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<NotificationResponseDto> {
    return this.inbox.get(actor, id);
  }

  @Patch('read-all')
  @ApiOperation({ summary: 'Mark all current-user notifications as read' })
  @ApiOkResponse({ type: NotificationMarkAllReadResponseDto })
  markAllRead(
    @CurrentUser() actor: Actor,
  ): Promise<NotificationMarkAllReadResponseDto> {
    return this.inbox.markAllRead(actor);
  }

  @Patch(':id/read')
  @ApiOperation({
    summary: 'Mark notification as read',
    description:
      'Đã đọc rồi thì giữ thời điểm đọc cũ. Không có hoặc thuộc người khác: 404.',
  })
  @ApiOkResponse({ type: NotificationResponseDto })
  markRead(
    @CurrentUser() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<NotificationResponseDto> {
    return this.inbox.markRead(actor, id);
  }
}
