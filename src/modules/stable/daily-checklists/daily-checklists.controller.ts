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
  ApiTags,
} from '@nestjs/swagger';
import { Access, CurrentUser } from '../../../common/decorators';
import { UserRole } from '../../../common/enums';
import type { Actor } from '../../../common/types/actor';
import {
  DailyChecklistQueryDto,
  DailyChecklistResponseDto,
  TickChecklistItemDto,
} from '../dto/daily-checklist.dto';
import { GroomTodayResponseDto } from '../dto/groom-today.dto';
import { ChecklistsService } from './checklists.service';
import { GroomTodayService } from './groom-today.service';

@ApiTags('stable')
@ApiBearerAuth()
@Controller()
export class DailyChecklistsController {
  constructor(
    private readonly checklists: ChecklistsService,
    private readonly groomToday: GroomTodayService,
  ) {}

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

  @Access([UserRole.GROOM])
  @Get('grooms/me/today')
  @ApiOperation({
    summary: 'Màn Hôm nay của Groom: việc trong ngày của từng ngựa phụ trách',
  })
  @ApiOkResponse({ type: GroomTodayResponseDto })
  today(@CurrentUser() actor: Actor) {
    return this.groomToday.today(actor);
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
