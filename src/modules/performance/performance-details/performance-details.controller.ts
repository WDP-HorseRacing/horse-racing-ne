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
import { HorseAlertPageDto, HorseAlertQueryDto } from '../dto/horse-alert.dto';
import {
  HorseWorkloadDto,
  HorseWorkloadQueryDto,
} from '../dto/horse-workload.dto';
import { PerformanceDetailsService } from './performance-details.service';

@ApiTags('performance')
@ApiBearerAuth()
@Controller()
export class PerformanceDetailsController {
  constructor(private readonly details: PerformanceDetailsService) {}

  @Access([UserRole.CLUB_MANAGER, UserRole.HEAD_TRAINER, UserRole.VETERINARIAN])
  @Get('horses/:id/alerts')
  @ApiOperation({
    summary: 'Lịch sử điểm đo vượt ngưỡng (WARNING, CRITICAL) của ngựa',
  })
  @ApiOkResponse({ type: HorseAlertPageDto })
  alerts(
    @CurrentUser() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: HorseAlertQueryDto,
  ) {
    return this.details.alerts(actor, id, query);
  }

  @Get('horses/:id/workload')
  @ApiOperation({
    summary:
      'Khối lượng tập của ngựa trong một khoảng ngày (lượt đã hoàn thành)',
  })
  @ApiOkResponse({ type: HorseWorkloadDto })
  workload(
    @CurrentUser() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: HorseWorkloadQueryDto,
  ) {
    return this.details.workload(actor, id, query);
  }
}
