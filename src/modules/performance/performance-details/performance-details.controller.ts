import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../../../common/decorators';
import { PendingApi } from '../../../common/openapi/pending-api';
import type { Actor } from '../../../common/types/actor';
import {
  HorseWorkloadDto,
  HorseWorkloadQueryDto,
} from '../dto/horse-workload.dto';
import { PerformanceDetailsService } from './performance-details.service';

@ApiTags('performance')
@ApiBearerAuth()
@Controller()
export class PerformanceDetailsController extends PendingApi {
  constructor(private readonly details: PerformanceDetailsService) {
    super();
  }

  @Get('horses/:id/alerts')
  @ApiOperation({ summary: 'List horse performance alerts' })
  @ApiResponse({ status: 501, description: 'Contract only' })
  alerts(
    @CurrentUser() _actor: Actor,
    @Param('id', ParseUUIDPipe) _id: string,
  ) {
    return this.pending();
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
