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
  UpdateHorseHealthDto,
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
      'Không ghi gì. Trả về có được đổi không và từng hệ quả (giáo án bị hủy, đăng ký bị rút, ô bị trả, groom kết thúc, khu bị bỏ, khóa huấn luyện tự gỡ, sức khỏe đặt lại) để hiện bảng xác nhận.',
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
      'Bắt buộc lý do. Giải nghệ: hủy giáo án đang mở, rút đăng ký thi đấu chưa diễn ra. Chuyển nhượng: thêm trả ô, kết thúc groom, bỏ khu, tự gỡ khóa huấn luyện; giữ chủ sở hữu. Kích hoạt lại: sức khỏe về UNDER_OBSERVATION. Nên gọi preview trước để xác nhận.',
  })
  @ApiOkResponse({ type: HorseResponseDto })
  updateLifecycle(
    @CurrentUser() actor: Actor,
    @Param('horseId', ParseUUIDPipe) horseId: string,
    @Body() body: UpdateHorseLifecycleDto,
  ): Promise<HorseResponseDto> {
    return this.statusesService.updateLifecycle(actor, horseId, body);
  }

  @Access([UserRole.VETERINARIAN])
  @Patch('health-status')
  @ApiOperation({ summary: 'Change horse health status' })
  @ApiOkResponse({ type: HorseResponseDto })
  updateHealth(
    @CurrentUser() actor: Actor,
    @Param('horseId', ParseUUIDPipe) horseId: string,
    @Body() body: UpdateHorseHealthDto,
  ): Promise<HorseResponseDto> {
    return this.statusesService.updateHealth(actor, horseId, body);
  }
}
