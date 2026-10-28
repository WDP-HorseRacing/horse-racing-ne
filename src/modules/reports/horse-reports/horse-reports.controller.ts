import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Access, CurrentUser } from '../../../common/decorators';
import { UserRole } from '../../../common/enums';
import type { Actor } from '../../../common/types/actor';
import {
  HorseHealthResponseDto,
  HorseProgressResponseDto,
} from '../dto/horse-report.dto';
import { ReportPeriodDto } from '../dto/report-period.dto';
import { HorseReportsService } from './horse-reports.service';

@ApiTags('reports')
@ApiBearerAuth()
@Controller('reports')
export class HorseReportsController {
  constructor(private readonly reports: HorseReportsService) {}

  @Access([
    UserRole.CLUB_MANAGER,
    UserRole.HEAD_TRAINER,
    UserRole.VETERINARIAN,
    UserRole.HORSE_OWNER,
  ])
  @Get('horses/:horseId/progress')
  @ApiOperation({
    summary: 'Tiến độ tập luyện của một con ngựa theo khoảng ngày',
  })
  @ApiOkResponse({ type: HorseProgressResponseDto })
  progress(
    @CurrentUser() actor: Actor,
    @Param('horseId', ParseUUIDPipe) horseId: string,
    @Query() query: ReportPeriodDto,
  ) {
    return this.reports.progress(actor, horseId, query);
  }

  @Access([
    UserRole.CLUB_MANAGER,
    UserRole.HEAD_TRAINER,
    UserRole.VETERINARIAN,
    UserRole.HORSE_OWNER,
  ])
  @Get('horses/:horseId/health')
  @ApiOperation({
    summary: 'Lịch sử sức khỏe của một con ngựa theo khoảng ngày',
  })
  @ApiOkResponse({ type: HorseHealthResponseDto })
  health(
    @CurrentUser() actor: Actor,
    @Param('horseId', ParseUUIDPipe) horseId: string,
    @Query() query: ReportPeriodDto,
  ) {
    return this.reports.health(actor, horseId, query);
  }
}
