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
import {
  ClubFinanceResponseDto,
  OwnerCostQueryDto,
  OwnerCostResponseDto,
} from '../dto/finance-report.dto';
import { ReportPeriodDto } from '../dto/report-period.dto';
import { FinanceReportsService } from './finance-reports.service';

@ApiTags('reports')
@ApiBearerAuth()
@Controller('reports')
export class FinanceReportsController {
  constructor(private readonly reports: FinanceReportsService) {}

  @Access([UserRole.CLUB_MANAGER])
  @Get('club/finance')
  @ApiOperation({
    summary:
      'Khoản thu từ chủ ngựa, giá trị vật tư và tiền thưởng của CLB theo khoảng ngày',
  })
  @ApiOkResponse({ type: ClubFinanceResponseDto })
  clubFinance(@CurrentUser() actor: Actor, @Query() query: ReportPeriodDto) {
    return this.reports.clubFinance(actor, query);
  }

  @Access([UserRole.CLUB_MANAGER, UserRole.HORSE_OWNER])
  @Get('owner/costs')
  @ApiOperation({
    summary: 'Phí nuôi và chi phí y tế của một chủ ngựa theo khoảng ngày',
    description:
      'Club Manager bắt buộc truyền ownerId (thiếu: 400, không có tài khoản: 404).',
  })
  @ApiOkResponse({ type: OwnerCostResponseDto })
  ownerCost(@CurrentUser() actor: Actor, @Query() query: OwnerCostQueryDto) {
    return this.reports.ownerCost(actor, query);
  }
}
