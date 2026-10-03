import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Access, CurrentUser } from '../../../common/decorators';
import { UserRole } from '../../../common/enums/role.enum';
import type { Actor } from '../../../common/types/actor';
import {
  BarnListItemDto,
  BarnResponseDto,
  CreateBarnDto,
  UpdateBarnDto,
} from '../dto/barn.dto';
import { BarnsService } from './barns.service';

@ApiTags('stable')
@ApiBearerAuth()
@Controller('barns')
export class BarnsController {
  constructor(private readonly barnsService: BarnsService) {}

  @Access([
    UserRole.CLUB_MANAGER,
    UserRole.HEAD_TRAINER,
    UserRole.VETERINARIAN,
    UserRole.GROOM,
  ])
  @Get()
  @ApiOperation({
    summary: 'List barns of the club with their head trainer',
    description:
      'Mỗi khu kèm tên Head Trainer phụ trách, availableStallCount (số ô trống trừ số ngựa của khu đang chờ xếp ô, không âm; bằng 0 là không xếp thêm ngựa được) và pendingStallHorseCount (số ngựa của khu chưa xóa, chưa chuyển nhượng, chưa có ô).',
  })
  @ApiOkResponse({ type: [BarnListItemDto] })
  list(@CurrentUser() actor: Actor): Promise<BarnListItemDto[]> {
    return this.barnsService.list(actor);
  }

  @Access([
    UserRole.CLUB_MANAGER,
    UserRole.HEAD_TRAINER,
    UserRole.VETERINARIAN,
    UserRole.GROOM,
  ])
  @Get(':id')
  @ApiOperation({ summary: 'Get barn details' })
  @ApiOkResponse({ type: BarnResponseDto })
  get(
    @CurrentUser() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<BarnResponseDto> {
    return this.barnsService.get(actor, id);
  }

  @Access([UserRole.CLUB_MANAGER])
  @Post()
  @ApiOperation({ summary: 'Create barn' })
  @ApiCreatedResponse({ type: BarnResponseDto })
  create(
    @CurrentUser() actor: Actor,
    @Body() body: CreateBarnDto,
  ): Promise<BarnResponseDto> {
    return this.barnsService.create(actor, body);
  }

  @Access([UserRole.CLUB_MANAGER])
  @Patch(':id')
  @ApiOperation({
    summary: 'Update barn details or its head trainer',
    description:
      'Sửa tên, mô tả, sức chứa, trạng thái và Head Trainer phụ trách; gửi headTrainerId = null để gỡ người phụ trách. Head Trainer mới phải đang hoạt động (400 nếu không có hoặc sai vai trò, 409 nếu không còn ACTIVE). Khu còn ngựa thì không chuyển được sang CLOSED hoặc MAINTENANCE và không gỡ được Head Trainer (409). Sức chứa không được nhỏ hơn số ô hiện có, tên khu không được trùng (409).',
  })
  @ApiOkResponse({ type: BarnResponseDto })
  update(
    @CurrentUser() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateBarnDto,
  ): Promise<BarnResponseDto> {
    return this.barnsService.update(actor, id, body);
  }

  @Access([UserRole.CLUB_MANAGER])
  @Delete(':id')
  @ApiOperation({ summary: 'Soft-delete barn' })
  @ApiNoContentResponse()
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @CurrentUser() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.barnsService.remove(actor, id);
  }
}
