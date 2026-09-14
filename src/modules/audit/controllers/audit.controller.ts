import { Controller, Get, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { PendingApi } from '../../../common/api/pending-api';

@ApiTags('audit')
@ApiBearerAuth()
@ApiResponse({ status: 501, description: 'Contract only' })
@Controller('audit-logs')
export class AuditController extends PendingApi {
  @Get()
  @ApiOperation({ summary: 'List club audit records' })
  list(@Query('limit') _limit?: number) {
    return this.pending();
  }
}
