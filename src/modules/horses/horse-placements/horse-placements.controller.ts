import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Put,
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
  AssignHorseBarnDto,
  BarnPreviewQueryDto,
  HorseBarnPreviewResponseDto,
  HorsePlacementResponseDto,
  HorseResponseDto,
  PlaceHorseDto,
} from '../dto';
import { HorsePlacementsService } from './horse-placements.service';

@ApiTags('horses')
@ApiBearerAuth()
@Controller('horses/:horseId')
export class HorsePlacementsController {
  constructor(private readonly placements: HorsePlacementsService) {}

  @Access([UserRole.CLUB_MANAGER])
  @Get('barn-preview')
  @ApiOperation({
    summary: 'Preview the consequences of changing the barn of a horse',
    description:
      'Không ghi gì. Trả về ô sẽ được trả, số lớp sẽ bị rút, Groom giữ nguyên, Head Trainer khu mới và câu tóm tắt. allowed = false kèm blockedReason khi không đổi được, kể cả khi ngựa đang tập ở lớp sẽ bị rút.',
  })
  @ApiOkResponse({ type: HorseBarnPreviewResponseDto })
  previewBarnChange(
    @CurrentUser() actor: Actor,
    @Param('horseId', ParseUUIDPipe) horseId: string,
    @Query() query: BarnPreviewQueryDto,
  ): Promise<HorseBarnPreviewResponseDto> {
    return this.placements.previewBarnChange(actor, horseId, query);
  }

  @Access([UserRole.CLUB_MANAGER])
  @Put('barn')
  @ApiOperation({
    summary: 'Assign or change the barn of a horse',
    description:
      'Chỉ Club Manager. Bắt buộc lý do khi đổi khu (ngựa đã có khu); xếp khu lần đầu thì bỏ trống được. Khu phải đang hoạt động, có Head Trainer và còn ô trống. Đổi khu thì ô cũ được trả về trống, ngựa vào "Chờ xếp ô" của khu mới, Groom giữ nguyên. Ngựa đã chuyển nhượng trả 409.',
  })
  @ApiOkResponse({ type: HorseResponseDto })
  assignBarn(
    @CurrentUser() actor: Actor,
    @Param('horseId', ParseUUIDPipe) horseId: string,
    @Body() body: AssignHorseBarnDto,
  ): Promise<HorseResponseDto> {
    return this.placements.assignBarn(actor, horseId, body);
  }

  @Access([UserRole.HEAD_TRAINER])
  @Put('placement')
  @ApiOperation({
    summary: 'Place a horse in a stall and assign its groom in one step',
    description:
      'Head Trainer phụ trách khu của ngựa. Xếp ô và giao Groom trong cùng một transaction: một phần lỗi thì không lưu gì. Luật từng phần như PUT /horses/:id/stall và PUT /horses/:id/groom.',
  })
  @ApiOkResponse({ type: HorsePlacementResponseDto })
  placeHorse(
    @CurrentUser() actor: Actor,
    @Param('horseId', ParseUUIDPipe) horseId: string,
    @Body() body: PlaceHorseDto,
  ): Promise<HorsePlacementResponseDto> {
    return this.placements.placeHorse(actor, horseId, body);
  }
}
