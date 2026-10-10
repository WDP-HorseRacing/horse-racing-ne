import {
  Body,
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
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Access, CurrentUser } from '../../../common/decorators';
import { UserRole } from '../../../common/enums';
import { PendingApi } from '../../../common/openapi/pending-api';
import type { Actor } from '../../../common/types/actor';
import {
  DailyChecklistQueryDto,
  DailyChecklistResponseDto,
  TickChecklistItemDto,
} from '../dto/daily-checklist.dto';
import { ChecklistsService } from './checklists.service';

@ApiTags('stable')
@ApiBearerAuth()
@Controller()
export class DailyChecklistsController extends PendingApi {
  constructor(private readonly checklists: ChecklistsService) {
    super();
  }

  @Access([UserRole.CLUB_MANAGER, UserRole.HEAD_TRAINER, UserRole.GROOM])
  @Get('horses/:horseId/checklists')
  @ApiOperation({ summary: 'Checklist hằng ngày của ngựa theo khoảng ngày' })
  @ApiOkResponse({ type: [DailyChecklistResponseDto] })
  listForHorse(
    @CurrentUser() actor: Actor,
    @Param('horseId', ParseUUIDPipe) horseId: string,
    @Query() query: DailyChecklistQueryDto,
  ) {
    return this.checklists.listForHorse(actor, horseId, query);
  }

  @Get('grooms/me/today')
  @ApiResponse({ status: 501, description: 'Contract only' })
  @ApiOperation({ summary: 'Get today assigned groom checklist' })
  today(@CurrentUser() _actor: Actor) {
    return this.pending();
  }

  @Access([UserRole.GROOM])
  @Patch('checklist-items/:id')
  @ApiOperation({
    summary: 'Tick hoặc gỡ tick một việc trong checklist hôm nay',
  })
  @ApiOkResponse({ type: DailyChecklistResponseDto })
  tick(
    @CurrentUser() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: TickChecklistItemDto,
  ) {
    return this.checklists.tick(actor, id, body);
  }
}
