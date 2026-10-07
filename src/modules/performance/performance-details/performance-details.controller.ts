import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../../../common/decorators';
import { PendingApi } from '../../../common/openapi/pending-api';
import type { Actor } from '../../../common/types/actor';

@ApiTags('performance')
@ApiBearerAuth()
@ApiResponse({ status: 501, description: 'Contract only' })
@Controller()
export class PerformanceDetailsController extends PendingApi {
  @Get('horses/:id/alerts')
  @ApiOperation({ summary: 'List horse performance alerts' })
  alerts(
    @CurrentUser() _actor: Actor,
    @Param('id', ParseUUIDPipe) _id: string,
  ) {
    return this.pending();
  }

  @Get('horses/:id/workload')
  @ApiOperation({ summary: 'Get configured training workload summary' })
  workload(
    @CurrentUser() _actor: Actor,
    @Param('id', ParseUUIDPipe) _id: string,
  ) {
    return this.pending();
  }
}
