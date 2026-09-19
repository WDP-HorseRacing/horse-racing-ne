import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { PendingApi } from '../../../common/openapi/pending-api';
import { CreateChecklistDto } from '../dto/daily-checklist.dto';

@ApiTags('stable')
@ApiBearerAuth()
@ApiResponse({ status: 501, description: 'Contract only' })
@Controller()
export class DailyChecklistsController extends PendingApi {
  @Get('horses/:horseId/checklists')
  @ApiOperation({ summary: 'List horse daily checklists' })
  checklists(@Param('horseId') _horseId: string) {
    return this.pending();
  }

  @Post('horses/:horseId/checklists')
  @ApiOperation({ summary: 'Create assigned daily checklist' })
  createChecklist(
    @Param('horseId') _horseId: string,
    @Body() _body: CreateChecklistDto,
  ) {
    return this.pending();
  }

  @Get('grooms/me/today')
  @ApiOperation({ summary: 'Get today assigned groom checklist' })
  today() {
    return this.pending();
  }

  @Patch('checklists/:id/complete')
  @ApiOperation({ summary: 'Complete assigned checklist item' })
  complete(@Param('id') _id: string) {
    return this.pending();
  }
}
