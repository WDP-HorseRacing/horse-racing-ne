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
    summary: 'Medical dashboard',
    description:
      'Bảy khối: sơ đồ đàn theo sức khỏe, lịch khám đến hạn/quá hạn, lịch tiêm phòng/tẩy giun/kiểm tra móng đến hạn, bệnh án đang mở, ngựa Chấn thương/Cách ly chưa có bệnh án, thuốc cần cho hôm nay, yêu cầu khám đang chờ. Head Trainer chỉ xem các khu mình phụ trách: không chọn khu thì lấy mọi khu mình phụ trách, chọn khu khác thì 403. Groom và Horse Owner: 403.',
  })
  @ApiOkResponse({ type: MedicalDashboardResponseDto })
  get(
    @CurrentUser() actor: Actor,
    @Query() query: MedicalDashboardQueryDto,
  ): Promise<MedicalDashboardResponseDto> {
    return this.dashboard.get(actor, query);
  }
}
