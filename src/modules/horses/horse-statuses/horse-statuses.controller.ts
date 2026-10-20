import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Access, CurrentUser } from '../../../common/decorators';
import { UserRole } from '../../../common/enums/role.enum';
import type { Actor } from '../../../common/types/actor';
import {
  HorseLifecyclePreviewResponseDto,
  HorseResponseDto,
  LifecyclePreviewQueryDto,
  UpdateHorseLifecycleDto,
} from '../dto';
import { HorseStatusesService } from './horse-statuses.service';

@ApiTags('horses')
@ApiBearerAuth()
@Controller('horses/:horseId')
export class HorseStatusesController {
  constructor(private readonly statusesService: HorseStatusesService) {}

  @Access([UserRole.CLUB_MANAGER])
  @Get('lifecycle-status/preview')
  @ApiOperation({
    summary: 'Preview the consequences of a lifecycle change',
    description:
      'Không ghi gì. Trả về có được đổi không và từng hệ quả (số lớp bị rút, đăng ký bị rút, ô bị trả, groom kết thúc, khu bị bỏ, khóa huấn luyện tự gỡ, khẩu phần lưu trữ, bản nháp khẩu phần xóa, việc riêng kết thúc hoặc xóa, checklist hôm nay hủy, sức khỏe đặt lại).',
  })
  @ApiOkResponse({ type: HorseLifecyclePreviewResponseDto })
  previewLifecycle(
    @CurrentUser() actor: Actor,
    @Param('horseId', ParseUUIDPipe) horseId: string,
    @Query() query: LifecyclePreviewQueryDto,
  ): Promise<HorseLifecyclePreviewResponseDto> {
    return this.statusesService.previewLifecycle(actor, horseId, query);
  }

  @Access([UserRole.CLUB_MANAGER])
  @Patch('lifecycle-status')
  @ApiOperation({
    summary: 'Change horse lifecycle status',
    description:
      'Bắt buộc lý do. Giải nghệ: rút khỏi các lớp đang học, rút đăng ký thi đấu chưa diễn ra. Chuyển nhượng: thêm trả ô, kết thúc groom, bỏ khu, tự gỡ khóa huấn luyện, chốt chăm sóc chuồng (khẩu phần ACTIVE thành ARCHIVED, xóa bản nháp, việc riêng đang chạy kết thúc ở hôm nay, xóa việc riêng chưa bắt đầu, checklist hôm nay chưa xong thành CANCELLED), kết thúc giai đoạn sở hữu và bỏ trống chủ. Ghi nhận đã mất (DECEASED, từ ACTIVE hoặc RETIRED): ngày mất ghi là hôm nay theo lịch câu lạc bộ, dọn như chuyển nhượng, giữ chủ sở hữu, không đặt lại sức khỏe; ngựa đã mất không đổi được vòng đời (409). Chuyển nhượng hoặc ghi nhận mất khi còn bệnh án đang mở trả 409. Kích hoạt lại từ chuyển nhượng: sức khỏe về QUARANTINED; từ giải nghệ giữ nguyên sức khỏe.',
  })
  @ApiOkResponse({ type: HorseResponseDto })
  updateLifecycle(
    @CurrentUser() actor: Actor,
    @Param('horseId', ParseUUIDPipe) horseId: string,
    @Body() body: UpdateHorseLifecycleDto,
  ): Promise<HorseResponseDto> {
    return this.statusesService.updateLifecycle(actor, horseId, body);
  }
}
