import { Controller, Get, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Access, CurrentUser } from '../../../common/decorators';
import { UserRole } from '../../../common/enums/role.enum';
import type { Actor } from '../../../common/types/actor';
import { MedicalDashboardQueryDto, MedicalDashboardResponseDto } from '../dto';
import { MedicalDashboardService } from './medical-dashboard.service';

@ApiTags('medical')
@ApiBearerAuth()
@Controller()
export class MedicalDashboardController {
  constructor(private readonly dashboard: MedicalDashboardService) {}

  @Access([UserRole.VETERINARIAN, UserRole.CLUB_MANAGER, UserRole.HEAD_TRAINER])
  @Get('medical/dashboard')
  @ApiOperation({
    summary: 'Medical dashboard (F3.1)',
    description:
      'Bốn khối: sơ đồ đàn theo sức khỏe, lịch khám đến hạn/quá hạn, bệnh án đang mở, yêu cầu khám đang chờ. Groom và Horse Owner: 403.',
  })
  @ApiOkResponse({ type: MedicalDashboardResponseDto })
  get(
    @CurrentUser() actor: Actor,
    @Query() query: MedicalDashboardQueryDto,
  ): Promise<MedicalDashboardResponseDto> {
    return this.dashboard.get(actor, query);
  }
}
