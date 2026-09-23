import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
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
import { IngestMetricDto } from '../dto/ingest-metric.dto';

@ApiTags('performance')
@ApiBearerAuth()
@ApiResponse({ status: 501, description: 'Contract only' })
@Controller()
export class PerformanceMetricsController extends PendingApi {
  @Post('sessions/:id/metrics')
  @ApiOperation({
    summary: 'Ingest session metric',
    operationId: 'PerformanceController_ingest',
  })
  ingest(
    @CurrentUser() _actor: Actor,
    @Param('id', ParseUUIDPipe) _id: string,
    @Body() _body: IngestMetricDto,
  ) {
    return this.pending();
  }

  @Get('sessions/:id/metrics')
  @ApiOperation({
    summary: 'List session metrics',
    operationId: 'PerformanceController_list',
  })
  list(@CurrentUser() _actor: Actor, @Param('id', ParseUUIDPipe) _id: string) {
    return this.pending();
  }
}
