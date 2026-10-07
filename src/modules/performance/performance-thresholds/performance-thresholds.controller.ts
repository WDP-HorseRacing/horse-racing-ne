import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Put,
} from '@nestjs/common';
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
  HorseThresholdsResponseDto,
  ThresholdProfileResponseDto,
  UpsertThresholdDto,
} from '../dto/upsert-threshold.dto';
import { PerformanceThresholdsService } from './performance-thresholds.service';

@ApiTags('performance')
@ApiBearerAuth()
@Controller()
export class PerformanceThresholdsController {
  constructor(private readonly thresholds: PerformanceThresholdsService) {}

  @Access([UserRole.HEAD_TRAINER, UserRole.CLUB_MANAGER, UserRole.VETERINARIAN])
  @Get('horses/:id/thresholds')
  @ApiOperation({
    summary: 'Xem ngưỡng nhịp tim/tốc độ đang áp và lịch sử phiên bản của ngựa',
  })
  @ApiOkResponse({ type: HorseThresholdsResponseDto })
  list(@CurrentUser() actor: Actor, @Param('id', ParseUUIDPipe) id: string) {
    return this.thresholds.list(actor, id);
  }

  @Access([UserRole.HEAD_TRAINER, UserRole.CLUB_MANAGER])
  @Put('horses/:id/thresholds')
  @ApiOperation({
    summary: 'Tạo phiên bản ngưỡng nhịp tim/tốc độ mới cho ngựa',
  })
  @ApiOkResponse({ type: ThresholdProfileResponseDto })
  upsert(
    @CurrentUser() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpsertThresholdDto,
  ) {
    return this.thresholds.upsert(actor, id, body);
  }
}
