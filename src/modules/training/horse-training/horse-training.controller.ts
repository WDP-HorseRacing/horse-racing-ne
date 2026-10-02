import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Access, CurrentUser } from '../../../common/decorators';
import { PaginationResponseDto } from '../../../common/dto/pagination-response.dto';
import { UserRole } from '../../../common/enums/role.enum';
import type { Actor } from '../../../common/types/actor';
import {
  HorseTrainingClassResponseDto,
  HorseTrainingSessionPageDto,
  HorseTrainingSessionQueryDto,
  HorseTrainingSessionResponseDto,
} from '../dto/horse-training.dto';
import { HorseTrainingService } from './horse-training.service';

const TRAINING_TAB_ROLES = [
  UserRole.CLUB_MANAGER,
  UserRole.HEAD_TRAINER,
  UserRole.VETERINARIAN,
  UserRole.HORSE_OWNER,
];

@ApiTags('training')
@ApiBearerAuth()
@Controller('horses/:horseId/training')
export class HorseTrainingController {
  constructor(private readonly horseTraining: HorseTrainingService) {}

  @Access(TRAINING_TAB_ROLES)
  @Get('classes')
  @ApiOperation({
    summary: 'List classes of a horse',
    description:
      'Các lớp của ngựa: lớp đang học trước, rồi tới lớp đã rời.',
  })
  @ApiOkResponse({ type: [HorseTrainingClassResponseDto] })
  listClasses(
    @CurrentUser() actor: Actor,
    @Param('horseId', ParseUUIDPipe) horseId: string,
  ): Promise<HorseTrainingClassResponseDto[]> {
    return this.horseTraining.listClasses(actor, horseId);
  }

  @Access(TRAINING_TAB_ROLES)
  @Get('sessions')
  @ApiOperation({
    summary: 'List training sessions of a horse',
    description:
      'Lịch buổi tập của ngựa kèm kết quả time trial và đánh giá, có phân trang.',
  })
  @ApiOkResponse({ type: HorseTrainingSessionPageDto })
  listSessions(
    @CurrentUser() actor: Actor,
    @Param('horseId', ParseUUIDPipe) horseId: string,
    @Query() query: HorseTrainingSessionQueryDto,
  ): Promise<PaginationResponseDto<HorseTrainingSessionResponseDto>> {
    return this.horseTraining.listSessions(actor, horseId, query);
  }
}
