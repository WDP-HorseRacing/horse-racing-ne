import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../../../common/decorators';
import { PendingApi } from '../../../common/openapi/pending-api';
import type { Actor } from '../../../common/types/actor';

@ApiTags('audit')
@ApiBearerAuth()
@ApiResponse({ status: 501, description: 'Contract only' })
@Controller('audit-logs')
export class AuditController extends PendingApi {
  @Get()
  @ApiOperation({ summary: 'List club audit records' })
  list(@CurrentUser() _actor: Actor, @Query('limit') _limit?: number) {
    return this.pending();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get club audit record' })
  get(@CurrentUser() _actor: Actor, @Param('id', ParseUUIDPipe) _id: string) {
    return this.pending();
  }
}
