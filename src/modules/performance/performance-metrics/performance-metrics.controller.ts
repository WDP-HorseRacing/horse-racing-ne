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
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Access, CurrentUser, Public } from '../../../common/decorators';
import { UserRole } from '../../../common/enums';
import type { Actor } from '../../../common/types/actor';
import {
  ParticipantPerformanceSummaryDto,
  PerformanceMetricPointDto,
} from '../dto/horse-performance.response.dto';
import {
  IngestMetricBatchDto,
  IngestMetricsResultDto,
} from '../dto/ingest-metric-batch.dto';
import { IngestMetricDto } from '../dto/ingest-metric.dto';
import { PerformanceMetricsService } from './performance-metrics.service';

@ApiTags('performance')
@ApiBearerAuth()
@Controller()
export class PerformanceMetricsController {
  constructor(private readonly metrics: PerformanceMetricsService) {}

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

  @Access([UserRole.CLUB_MANAGER, UserRole.VETERINARIAN, UserRole.HEAD_TRAINER])
  @Get('session-participants/:id/metrics')
  @ApiOperation({
    summary: 'Xem các điểm đo nhịp tim/tốc độ của lượt tập theo thời gian',
    operationId: 'PerformanceController_list',
  })
  @ApiOkResponse({ type: [PerformanceMetricPointDto] })
  list(@CurrentUser() actor: Actor, @Param('id', ParseUUIDPipe) id: string) {
    return this.metrics.list(actor, id);
  }

  @Access([
    UserRole.CLUB_MANAGER,
    UserRole.VETERINARIAN,
    UserRole.HEAD_TRAINER,
    UserRole.HORSE_OWNER,
  ])
  @Get('session-participants/:id/performance-summary')
  @ApiOperation({
    summary: 'Tổng kết nhịp tim, tốc độ và số cảnh báo của lượt tập',
  })
  @ApiOkResponse({ type: ParticipantPerformanceSummaryDto })
  summary(@CurrentUser() actor: Actor, @Param('id', ParseUUIDPipe) id: string) {
    return this.metrics.summary(actor, id);
  }
}
