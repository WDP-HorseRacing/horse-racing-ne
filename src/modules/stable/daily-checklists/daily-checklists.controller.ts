import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../../../common/decorators';
import { PendingApi } from '../../../common/openapi/pending-api';
import type { Actor } from '../../../common/types/actor';
import { CreateChecklistDto } from '../dto/daily-checklist.dto';

@ApiTags('stable')
@ApiBearerAuth()
@ApiResponse({ status: 501, description: 'Contract only' })
@Controller()
export class DailyChecklistsController extends PendingApi {
  @Get('horses/:horseId/checklists')
  @ApiOperation({ summary: 'List horse daily checklists' })
  checklists(
    @CurrentUser() _actor: Actor,
    @Param('horseId', ParseUUIDPipe) _horseId: string,
  ) {
    return this.pending();
  }

  @Post('horses/:horseId/checklists')
  @ApiOperation({ summary: 'Create assigned daily checklist' })
  createChecklist(
    @CurrentUser() _actor: Actor,
    @Param('horseId', ParseUUIDPipe) _horseId: string,
    @Body() _body: CreateChecklistDto,
  ) {
    return this.pending();
  }

  @Get('grooms/me/today')
  @ApiOperation({ summary: 'Get today assigned groom checklist' })
  today(@CurrentUser() _actor: Actor) {
    return this.pending();
  }

  @Patch('checklists/:id/complete')
  @ApiOperation({ summary: 'Complete assigned checklist item' })
  complete(
    @CurrentUser() _actor: Actor,
    @Param('id', ParseUUIDPipe) _id: string,
  ) {
    return this.pending();
  }
}
