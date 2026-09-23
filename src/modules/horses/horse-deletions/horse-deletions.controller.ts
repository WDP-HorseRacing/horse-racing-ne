import {
  Body,
  Controller,
  Delete,
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
import { DeleteHorseDto, HorseResponseDto, RestoreHorseDto } from '../dto';
import { HorseDeletionsService } from './horse-deletions.service';

@ApiTags('horses')
@ApiBearerAuth()
@Controller('horses/:horseId')
export class HorseDeletionsController {
  constructor(private readonly deletionsService: HorseDeletionsService) {}

  @Access([UserRole.CLUB_MANAGER])
  @Delete()
  @ApiOperation({
    summary: 'Soft-delete a horse profile created by mistake',
    description:
      'Bắt buộc nhập lý do. Bị chặn (409, message liệt kê dữ liệu đang vướng) nếu ngựa đã có dữ liệu nghiệp vụ hoặc đang là cha/mẹ của ngựa khác; khi đó hãy đổi trạng thái vòng đời. Ngựa đã chuyển nhượng trả 409. Hồ sơ đã xóa trả 403.',
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
  @Post('restore')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Restore a soft-deleted horse profile',
    description:
      'Bắt buộc nhập lý do. Hồ sơ trở về trạng thái trước khi xóa. Khu cũ không còn nhận được thì ngựa vào "Chờ xếp khu"; chủ cũ không còn là Horse Owner đang hoạt động thì bỏ trống chủ. Hồ sơ chưa bị xóa trả 409.',
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
