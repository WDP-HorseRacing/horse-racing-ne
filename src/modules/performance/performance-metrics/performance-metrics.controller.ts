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
  ApiCreatedResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser, Public } from '../../../common/decorators';
import { PendingApi } from '../../../common/openapi/pending-api';
import type { Actor } from '../../../common/types/actor';
import {
  IngestMetricBatchDto,
  IngestMetricsResultDto,
} from '../dto/ingest-metric-batch.dto';
import { IngestMetricDto } from '../dto/ingest-metric.dto';
import { PerformanceMetricsService } from './performance-metrics.service';

@ApiTags('performance')
@ApiBearerAuth()
@Controller()
export class PerformanceMetricsController extends PendingApi {
  constructor(private readonly metrics: PerformanceMetricsService) {
    super();
  }

  @Public()
  @Post('session-participants/:id/metrics')
  @ApiOperation({
    summary: 'Nhận một điểm đo nhịp tim/tốc độ của lượt tập đang diễn ra',
    operationId: 'PerformanceController_ingest',
  })
  @ApiCreatedResponse({ type: IngestMetricsResultDto })
  ingest(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: IngestMetricDto,
  ) {
    return this.metrics.ingest(id, [body]);
  }

  @Public()
  @Post('session-participants/:id/metrics/batch')
  @ApiOperation({
    summary: 'Nhận một lô điểm đo nhịp tim/tốc độ của lượt tập đang diễn ra',
  })
  @ApiCreatedResponse({ type: IngestMetricsResultDto })
  ingestBatch(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: IngestMetricBatchDto,
  ) {
    return this.metrics.ingest(id, body.metrics);
  }

  @Get('session-participants/:id/metrics')
  @ApiOperation({
    summary: 'List participant metrics',
    operationId: 'PerformanceController_list',
  })
  @ApiResponse({ status: 501, description: 'Contract only' })
  list(@CurrentUser() _actor: Actor, @Param('id', ParseUUIDPipe) _id: string) {
    return this.pending();
  }
}
