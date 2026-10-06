import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Access, CurrentUser } from '../../../common/decorators';
import { UserRole } from '../../../common/enums/role.enum';
import type { Actor } from '../../../common/types/actor';
import {
  CreateOwnershipTransferDto,
  HorseOwnershipResponseDto,
  HorseResponseDto,
} from '../dto';
import { HorseOwnershipsService } from './horse-ownerships.service';

@ApiTags('horses')
@ApiBearerAuth()
@Controller('horses/:horseId')
export class HorseOwnershipsController {
  constructor(private readonly ownershipsService: HorseOwnershipsService) {}

  @Access([UserRole.CLUB_MANAGER])
  @Post('ownership-transfers')
  @ApiOperation({
    summary: 'Transfer the horse to another owner in the club',
    description:
      'Chỉ Club Manager, ghi nhận sau khi hai bên đã thỏa thuận. Ngựa phải ACTIVE hoặc RETIRED và đang có chủ (409 nếu không). Chủ mới phải khác chủ hiện tại (400) và là Horse Owner đang hoạt động (400 sai vai trò, 409 không hoạt động). Ngày hiệu lực không ở tương lai, không trước ngày bắt đầu sở hữu của chủ hiện tại (400). Còn bệnh án đang mở trả 409. Sai version trả 409. Không đổi vòng đời, khu, ô, Groom, lớp. Báo cho chủ cũ và chủ mới.',
  })
  @ApiCreatedResponse({ type: HorseResponseDto })
  transfer(
    @CurrentUser() actor: Actor,
    @Param('horseId', ParseUUIDPipe) horseId: string,
    @Body() body: CreateOwnershipTransferDto,
  ): Promise<HorseResponseDto> {
    return this.ownershipsService.transfer(actor, horseId, body);
  }

  @Access([
    UserRole.CLUB_MANAGER,
    UserRole.HEAD_TRAINER,
    UserRole.VETERINARIAN,
    UserRole.GROOM,
    UserRole.HORSE_OWNER,
  ])
  @Get('ownerships')
  @ApiOperation({
    summary: 'List the ownership history of a horse',
    description:
      'Mới nhất lên trên. Club Manager, Head Trainer, Veterinarian, Groom xem toàn bộ. Horse Owner chỉ thấy các giai đoạn của chính mình trên ngựa mình đang sở hữu.',
  })
  @ApiOkResponse({ type: [HorseOwnershipResponseDto] })
  history(
    @CurrentUser() actor: Actor,
    @Param('horseId', ParseUUIDPipe) horseId: string,
  ): Promise<HorseOwnershipResponseDto[]> {
    return this.ownershipsService.history(actor, horseId);
  }
}
