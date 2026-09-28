import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
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
export class ReportsController extends PendingApi {
  @Get('dashboard')
  @ApiOperation({ summary: 'Get role-scoped dashboard summary' })
  dashboard(@CurrentUser() _actor: Actor, @Query() _period: ReportPeriodDto) {
    return this.pending();
  }

  @Get('horses/:horseId/progress')
  @ApiOperation({ summary: 'Get horse training progress report' })
  progress(
    @CurrentUser() _actor: Actor,
    @Param('horseId', ParseUUIDPipe) _horseId: string,
    @Query() _period: ReportPeriodDto,
  ) {
    return this.pending();
  }

  @Get('horses/:horseId/health')
  @ApiOperation({ summary: 'Get horse health history report' })
  health(
    @CurrentUser() _actor: Actor,
    @Param('horseId', ParseUUIDPipe) _horseId: string,
    @Query() _period: ReportPeriodDto,
  ) {
    return this.pending();
  }

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
