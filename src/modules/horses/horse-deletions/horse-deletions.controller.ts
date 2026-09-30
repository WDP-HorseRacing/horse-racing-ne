import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Access, CurrentUser } from '../../../common/decorators';
import { UserRole } from '../../../common/enums/role.enum';
import type { Actor } from '../../../common/types/actor';
import {
  DeleteHorseDto,
  HorseDeletionPreviewResponseDto,
  HorseResponseDto,
  HorseRestorePreviewResponseDto,
  RestoreHorseDto,
} from '../dto';
import { HorseDeletionsService } from './horse-deletions.service';

@ApiTags('horses')
@ApiBearerAuth()
@Controller('horses/:horseId')
export class HorseDeletionsController {
  constructor(private readonly deletionsService: HorseDeletionsService) {}

  @Access([UserRole.CLUB_MANAGER])
  @Get('deletion-preview')
  @ApiOperation({
    summary: 'Preview whether a horse profile can be deleted',
    description:
      'Không ghi gì. Trả về xóa được không và từng lý do chặn: đã chuyển nhượng, các loại dữ liệu nghiệp vụ đã phát sinh, đang là cha/mẹ của ngựa khác.',
  })
  @ApiOkResponse({ type: HorseDeletionPreviewResponseDto })
  previewRemove(
    @CurrentUser() actor: Actor,
    @Param('horseId', ParseUUIDPipe) horseId: string,
  ): Promise<HorseDeletionPreviewResponseDto> {
    return this.deletionsService.previewRemove(actor, horseId);
  }

  @Access([UserRole.CLUB_MANAGER])
  @Delete()
  @ApiOperation({
    summary: 'Soft-delete a horse profile created by mistake',
    description:
      'Bắt buộc nhập lý do. Bị chặn (409, message liệt kê dữ liệu đang vướng) nếu ngựa đã có dữ liệu nghiệp vụ hoặc đang là cha/mẹ của ngựa khác; khi đó hãy đổi trạng thái vòng đời. Ngựa đã chuyển nhượng trả 409. Hồ sơ đã xóa trả 409.',
  })
  @ApiNoContentResponse()
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteHorse(
    @CurrentUser() actor: Actor,
    @Param('horseId', ParseUUIDPipe) horseId: string,
    @Body() body: DeleteHorseDto,
  ): Promise<void> {
    return this.deletionsService.remove(actor, horseId, body);
  }

  @Access([UserRole.CLUB_MANAGER])
  @Get('restore-preview')
  @ApiOperation({
    summary: 'Preview the consequences of restoring a deleted horse profile',
    description:
      'Không ghi gì. Trả về khu ngựa sẽ rời (khôi phục luôn đưa ngựa vào Chờ xếp khu), chủ sẽ bị bỏ trống nếu không còn hoạt động, và câu tóm tắt để hiện bảng xác nhận. Hồ sơ chưa bị xóa trả 409.',
  })
  @ApiOkResponse({ type: HorseRestorePreviewResponseDto })
  previewRestore(
    @CurrentUser() actor: Actor,
    @Param('horseId', ParseUUIDPipe) horseId: string,
  ): Promise<HorseRestorePreviewResponseDto> {
    return this.deletionsService.previewRestore(actor, horseId);
  }

  @Access([UserRole.CLUB_MANAGER])
  @Post('restore')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Restore a soft-deleted horse profile',
    description:
      'Bắt buộc nhập lý do. Hồ sơ trở về trạng thái trước khi xóa. Ngựa luôn rời khu cũ và vào "Chờ xếp khu"; chủ cũ không còn là Horse Owner đang hoạt động thì bỏ trống chủ. Nên gọi restore-preview trước để xác nhận. Hồ sơ chưa bị xóa trả 409.',
  })
  @ApiOkResponse({ type: HorseResponseDto })
  restoreHorse(
    @CurrentUser() actor: Actor,
    @Param('horseId', ParseUUIDPipe) horseId: string,
    @Body() body: RestoreHorseDto,
  ): Promise<HorseResponseDto> {
    return this.deletionsService.restore(actor, horseId, body);
  }
}
