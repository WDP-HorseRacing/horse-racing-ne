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
  ApiOkResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Access, CurrentUser } from '../../../common/decorators';
import { UserRole } from '../../../common/enums/role.enum';
import { PendingApi } from '../../../common/openapi/pending-api';
import type { Actor } from '../../../common/types/actor';
import {
  HorsePerformanceResponseDto,
  SessionPerformanceSummaryDto,
} from '../dto/horse-performance.response.dto';
import { IngestMetricDto } from '../dto/ingest-metric.dto';
import { PerformanceService } from '../services/performance.service';

@ApiTags('performance')
@ApiBearerAuth()
@Controller()
export class PerformanceController extends PendingApi {
  constructor(private readonly performanceService: PerformanceService) {
    super();
  }

  @ApiResponse({ status: 501, description: 'Contract only' })
  @Post('sessions/:id/metrics')
  @ApiOperation({ summary: 'Ingest session metric' })
  ingest(@Param('id') _id: string, @Body() _body: IngestMetricDto) {
    return this.pending();
  }

  @ApiResponse({ status: 501, description: 'Contract only' })
  @Get('sessions/:id/metrics')
  @ApiOperation({ summary: 'List session metrics' })
  list(@Param('id') _id: string) {
    return this.pending();
  }

  @Access([
    UserRole.CLUB_MANAGER,
    UserRole.HEAD_TRAINER,
    UserRole.VETERINARIAN,
    UserRole.HORSE_OWNER,
  ])
  @Get('horses/:id/performance/sessions')
  @ApiOperation({
    summary: 'List per-session performance summary of a horse',
    description:
      'Mỗi buổi tập một dòng tổng hợp: nhịp tim, tốc độ trung bình/cao nhất và số cảnh báo. Horse Owner chỉ dùng API này, không xem số đo thô.',
  })
  @ApiOkResponse({ type: [SessionPerformanceSummaryDto] })
  sessions(
    @CurrentUser() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<SessionPerformanceSummaryDto[]> {
    return this.performanceService.listSessionSummaries(actor, id);
  }

  @Access([UserRole.CLUB_MANAGER, UserRole.HEAD_TRAINER, UserRole.VETERINARIAN])
  @Get('horses/:id/performance')
  @ApiOperation({ summary: 'Get horse performance summary' })
  @ApiOkResponse({ type: HorsePerformanceResponseDto })
  summary(
    @CurrentUser() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<HorsePerformanceResponseDto> {
    return this.performanceService.getHorseSummary(actor, id);
  }
}
