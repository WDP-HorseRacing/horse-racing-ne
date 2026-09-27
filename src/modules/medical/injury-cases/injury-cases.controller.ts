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
import { InjuryTimelineItemDto } from '../dto/injury-marker.response.dto';
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
    summary: 'List horse injury timeline',
    description:
      'Head Trainer, Veterinarian, Club Manager: toàn câu lạc bộ. Horse Owner: chỉ ngựa đang sở hữu, xem đầy đủ. Groom không xem.',
    operationId: 'MedicalController_listInjuries',
  })
  @ApiOkResponse({ type: [InjuryTimelineItemDto] })
  listInjuries(
    @CurrentUser() actor: Actor,
    @Param('horseId', ParseUUIDPipe) horseId: string,
  ): Promise<InjuryTimelineItemDto[]> {
    return this.injuryCases.listInjuries(actor, horseId);
  }
}
