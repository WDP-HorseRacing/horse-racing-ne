import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Access, CurrentUser } from '../../../common/decorators';
import { UserRole } from '../../../common/enums/role.enum';
import type { Actor } from '../../../common/types/actor';
import { InjuryResponseDto } from '../dto/injury-marker.response.dto';
import { InjuryListQueryDto } from '../dto/injury-query.dto';
import { InjuryCasesService } from './injury-cases.service';

@ApiTags('medical')
@ApiBearerAuth()
@Controller()
export class InjuryCasesController {
  constructor(private readonly injuryCases: InjuryCasesService) {}

  @Access([
    UserRole.CLUB_MANAGER,
    UserRole.HEAD_TRAINER,
    UserRole.VETERINARIAN,
    UserRole.HORSE_OWNER,
  ])
  @Get('horses/:horseId/injuries')
  @ApiOperation({
    summary: 'List horse injuries with current recovery status and history',
    description:
      'Head Trainer, Veterinarian, Club Manager: toàn câu lạc bộ. Horse Owner: chỉ ngựa đang sở hữu, xem đầy đủ. Groom không xem. Mức hồi phục hiện tại lấy từ lần ghi nhận mới nhất của buổi khám chưa hủy; chấn thương mà mọi buổi khám ghi nó đã hủy thì không trả về.',
    operationId: 'MedicalController_listInjuries',
  })
  @ApiOkResponse({ type: [InjuryResponseDto] })
  listInjuries(
    @CurrentUser() actor: Actor,
    @Param('horseId', ParseUUIDPipe) horseId: string,
    @Query() query: InjuryListQueryDto,
  ): Promise<InjuryResponseDto[]> {
    return this.injuryCases.listInjuries(actor, horseId, query);
  }
}
