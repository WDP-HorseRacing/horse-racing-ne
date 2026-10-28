import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Access, CurrentUser } from '../../../common/decorators';
import { UserRole } from '../../../common/enums/role.enum';
import type { Actor } from '../../../common/types/actor';
import {
  HorsePerformanceResponseDto,
  SessionPerformanceSummaryDto,
} from '../dto/horse-performance.response.dto';
import { PerformanceSummariesService } from './performance-summaries.service';

@ApiTags('performance')
@ApiBearerAuth()
@Controller()
export class PerformanceSummariesController {
  constructor(private readonly performance: PerformanceSummariesService) {}
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
    operationId: 'PerformanceController_sessions',
  })
  @ApiOkResponse({ type: [SessionPerformanceSummaryDto] })
  sessions(
    @CurrentUser() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<SessionPerformanceSummaryDto[]> {
    return this.performance.listSessionSummaries(actor, id);
  }

  @Access([UserRole.CLUB_MANAGER, UserRole.HEAD_TRAINER, UserRole.VETERINARIAN])
  @Get('horses/:id/performance')
  @ApiOperation({
    summary: 'Get horse performance summary',
    operationId: 'PerformanceController_summary',
  })
  @ApiOkResponse({ type: HorsePerformanceResponseDto })
  summary(
    @CurrentUser() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<HorsePerformanceResponseDto> {
    return this.performance.getHorseSummary(actor, id);
  }
}
