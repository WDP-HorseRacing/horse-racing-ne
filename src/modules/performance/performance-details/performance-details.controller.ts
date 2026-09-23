import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
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
import { IngestMetricBatchDto } from '../dto/ingest-metric-batch.dto';
import { UpsertThresholdDto } from '../dto/upsert-threshold.dto';

@ApiTags('performance')
@ApiBearerAuth()
@ApiResponse({ status: 501, description: 'Contract only' })
@Controller()
export class PerformanceDetailsController extends PendingApi {
  @Post('sessions/:id/metrics/batch')
  @ApiOperation({ summary: 'Ingest metric batch for active session' })
  ingestBatch(
    @CurrentUser() _actor: Actor,
    @Param('id', ParseUUIDPipe) _id: string,
    @Body() _body: IngestMetricBatchDto,
  ) {
    return this.pending();
  }

  @Get('sessions/:id/performance-summary')
  @ApiOperation({ summary: 'Get session metric and alert summary' })
  sessionSummary(
    @CurrentUser() _actor: Actor,
    @Param('id', ParseUUIDPipe) _id: string,
  ) {
    return this.pending();
  }

  @Get('horses/:id/thresholds')
  @ApiOperation({ summary: 'List current and historical threshold profiles' })
  thresholds(
    @CurrentUser() _actor: Actor,
    @Param('id', ParseUUIDPipe) _id: string,
  ) {
    return this.pending();
  }

  @Put('horses/:id/thresholds')
  @ApiOperation({ summary: 'Create new version of horse threshold profile' })
  setThreshold(
    @CurrentUser() _actor: Actor,
    @Param('id', ParseUUIDPipe) _id: string,
    @Body() _body: UpsertThresholdDto,
  ) {
    return this.pending();
  }

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
