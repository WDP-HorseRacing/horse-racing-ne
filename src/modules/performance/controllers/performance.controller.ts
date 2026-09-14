import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { PendingApi } from '../../../common/api/pending-api';
import { IngestMetricDto } from '../dto/ingest-metric.dto';

@ApiTags('performance')
@ApiBearerAuth()
@ApiResponse({ status: 501, description: 'Contract only' })
@Controller()
export class PerformanceController extends PendingApi {
  @Post('sessions/:id/metrics')
  @ApiOperation({ summary: 'Ingest session metric' })
  ingest(@Param('id') _id: string, @Body() _body: IngestMetricDto) {
    return this.pending();
  }

  @Get('sessions/:id/metrics')
  @ApiOperation({ summary: 'List session metrics' })
  list(@Param('id') _id: string) {
    return this.pending();
  }

  @Get('horses/:id/performance')
  @ApiOperation({ summary: 'Get horse performance summary' })
  summary(@Param('id') _id: string) {
    return this.pending();
  }
}
