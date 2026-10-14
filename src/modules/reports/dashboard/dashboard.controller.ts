import { Controller, Get, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Access, CurrentUser } from '../../../common/decorators';
import { UserRole } from '../../../common/enums';
import type { Actor } from '../../../common/types/actor';
import { DashboardQueryDto, DashboardResponseDto } from '../dto/dashboard.dto';
import { DashboardService } from './dashboard.service';

@ApiTags('reports')
@ApiBearerAuth()
@Controller('reports')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Access([UserRole.CLUB_MANAGER, UserRole.HEAD_TRAINER, UserRole.VETERINARIAN])
  @Get('dashboard')
  @ApiOperation({
    summary: 'Tiến độ tập luyện và thể lực của ngựa trong CLB theo khoảng ngày',
  })
  @ApiOkResponse({ type: DashboardResponseDto })
  get(@CurrentUser() actor: Actor, @Query() query: DashboardQueryDto) {
    return this.dashboard.get(actor, query);
  }
}
