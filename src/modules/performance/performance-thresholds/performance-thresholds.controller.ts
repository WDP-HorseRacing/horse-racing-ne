import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Access, CurrentUser } from '../../../common/decorators';
import { UserRole } from '../../../common/enums';
import type { Actor } from '../../../common/types/actor';
import { HorseThresholdsResponseDto } from '../dto/horse-thresholds.dto';
import { PerformanceThresholdsService } from './performance-thresholds.service';

@ApiTags('performance')
@ApiBearerAuth()
@Controller()
export class PerformanceThresholdsController {
  constructor(private readonly thresholds: PerformanceThresholdsService) {}

  @Access([UserRole.HEAD_TRAINER, UserRole.CLUB_MANAGER, UserRole.VETERINARIAN])
  @Get('horses/:id/thresholds')
  @ApiOperation({
    summary: 'Xem ngưỡng nhịp tim/tốc độ đang áp cho ngựa',
  })
  @ApiOkResponse({ type: HorseThresholdsResponseDto })
  list(@CurrentUser() actor: Actor, @Param('id', ParseUUIDPipe) id: string) {
    return this.thresholds.list(actor, id);
  }
}
