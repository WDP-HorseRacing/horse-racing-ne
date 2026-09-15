import { Body, Controller, Get, Param, Post, Put } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { PendingApi } from '../../../common/openapi/pending-api';
import { IngestMetricBatchDto } from '../dto/ingest-metric-batch.dto';
import { UpsertThresholdDto } from '../dto/upsert-threshold.dto';

@ApiTags('performance')
@ApiBearerAuth()
@ApiResponse({ status: 501, description: 'Contract only' })
@Controller()
export class PerformanceDetailsController extends PendingApi {
  @Post('sessions/:id/metrics/batch')
  @ApiOperation({ summary: 'Ingest metric batch for active session' })
  ingestBatch(@Param('id') _id: string, @Body() _body: IngestMetricBatchDto) {
    return this.pending();
  }

  @Get('sessions/:id/performance-summary')
  @ApiOperation({ summary: 'Get session metric and alert summary' })
  sessionSummary(@Param('id') _id: string) {
    return this.pending();
  }

  @Get('horses/:id/thresholds')
  @ApiOperation({ summary: 'List current and historical threshold profiles' })
  thresholds(@Param('id') _id: string) {
    return this.pending();
  }

  @Put('horses/:id/thresholds')
  @ApiOperation({ summary: 'Create new version of horse threshold profile' })
  setThreshold(@Param('id') _id: string, @Body() _body: UpsertThresholdDto) {
    return this.pending();
  }

  @Get('horses/:id/alerts')
  @ApiOperation({ summary: 'List horse performance alerts' })
  alerts(@Param('id') _id: string) {
    return this.pending();
  }

  @Get('horses/:id/workload')
  @ApiOperation({ summary: 'Get configured training workload summary' })
  workload(@Param('id') _id: string) {
    return this.pending();
  }
}
