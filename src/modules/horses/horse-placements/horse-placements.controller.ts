import { Body, Controller, Param, ParseUUIDPipe, Put } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Access, CurrentUser } from '../../../common/decorators';
import { UserRole } from '../../../common/enums/role.enum';
import type { Actor } from '../../../common/types/actor';
import { AssignHorseBarnDto, HorseResponseDto } from '../dto';
import { HorsePlacementsService } from './horse-placements.service';

@ApiTags('horses')
@ApiBearerAuth()
@Controller('horses/:horseId')
export class HorsePlacementsController {
  constructor(private readonly placements: HorsePlacementsService) {}

  @Access([UserRole.CLUB_MANAGER])
  @Put('barn')
  @ApiOperation({
    summary: 'Assign or change the barn of a horse',
    description:
      'Chỉ Club Manager, bắt buộc lý do. Khu phải đang hoạt động, có Head Trainer và còn ô trống. Đổi khu thì ô cũ được trả về trống, ngựa vào "Chờ xếp ô" của khu mới, Groom giữ nguyên. Ngựa đã chuyển nhượng trả 409.',
  })
  @ApiOkResponse({ type: HorseResponseDto })
  assignBarn(
    @CurrentUser() actor: Actor,
    @Param('horseId', ParseUUIDPipe) horseId: string,
    @Body() body: AssignHorseBarnDto,
  ): Promise<HorseResponseDto> {
    return this.placements.assignBarn(actor, horseId, body);
  }
}
