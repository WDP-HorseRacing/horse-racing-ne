import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Access, CurrentUser } from '../../../common/decorators';
import { UserRole } from '../../../common/enums/role.enum';
import type { Actor } from '../../../common/types/actor';
import { PastHorseDetailDto, PastHorseListItemDto } from '../dto';
import { PastHorsesService } from './past-horses.service';

@ApiTags('horses')
@ApiBearerAuth()
@Controller('past-horses')
export class PastHorsesController {
  constructor(private readonly pastHorses: PastHorsesService) {}

  @Access([UserRole.HORSE_OWNER])
  @Get()
  @ApiOperation({
    summary: 'List horses the current owner sold or transferred',
    description:
      'Chỉ Horse Owner. Các con ngựa người gọi từng sở hữu, đã kết thúc giai đoạn sở hữu (chuyển nhượng nội bộ hoặc bán ra ngoài) và không còn là chủ hiện tại; bỏ hồ sơ đã xóa. Mỗi dòng có tên, ảnh và các khoảng đã sở hữu. Không có chủ mới, khu, sức khỏe.',
  })
  @ApiOkResponse({ type: [PastHorseListItemDto] })
  list(@CurrentUser() actor: Actor): Promise<PastHorseListItemDto[]> {
    return this.pastHorses.list(actor);
  }

  @Access([UserRole.HORSE_OWNER])
  @Get(':horseId')
  @ApiOperation({
    summary: 'Get basic information of a horse the current owner sold',
    description:
      'Chỉ Horse Owner từng có giai đoạn sở hữu đã kết thúc của con ngựa và không còn là chủ hiện tại; không thì 404. Trả tên, ảnh, giới tính, ngày sinh, màu lông, phả hệ 2 đời (chỉ tên) và các khoảng đã sở hữu.',
  })
  @ApiOkResponse({ type: PastHorseDetailDto })
  detail(
    @CurrentUser() actor: Actor,
    @Param('horseId', ParseUUIDPipe) horseId: string,
  ): Promise<PastHorseDetailDto> {
    return this.pastHorses.detail(actor, horseId);
  }
}
