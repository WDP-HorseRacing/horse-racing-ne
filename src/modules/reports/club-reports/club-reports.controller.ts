import { Controller, Get, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../../../common/decorators';
import { PendingApi } from '../../../common/openapi/pending-api';
import type { Actor } from '../../../common/types/actor';
import { ReportPeriodDto } from '../dto/report-period.dto';

@ApiTags('reports')
@ApiBearerAuth()
@ApiResponse({ status: 501, description: 'Contract only' })
@Controller('reports')
export class ClubReportsController extends PendingApi {
  @Get('club/training')
  @ApiOperation({ summary: 'Get club training activity report' })
  clubTraining(
    @CurrentUser() _actor: Actor,
    @Query() _period: ReportPeriodDto,
  ) {
    return this.pending();
  }

  @Get('club/medical')
  @ApiOperation({ summary: 'Get club medical activity report' })
  clubMedical(@CurrentUser() _actor: Actor, @Query() _period: ReportPeriodDto) {
    return this.pending();
  }

  @Get('club/finance')
  @ApiOperation({ summary: 'Get later-phase manual finance summary' })
  clubFinance(@CurrentUser() _actor: Actor, @Query() _period: ReportPeriodDto) {
    return this.pending();
  }
}
