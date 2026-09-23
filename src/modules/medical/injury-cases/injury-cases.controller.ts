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
  ApiOkResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Access, CurrentUser } from '../../../common/decorators';
import { UserRole } from '../../../common/enums/role.enum';
import { PendingApi } from '../../../common/openapi/pending-api';
import type { Actor } from '../../../common/types/actor';
import { CreateInjuryDto } from '../dto/create-injury.dto';
import { InjuryMarkerResponseDto } from '../dto/injury-marker.response.dto';
import { InjuryCasesService } from './injury-cases.service';

@ApiTags('medical')
@ApiBearerAuth()
@Controller()
export class InjuryCasesController extends PendingApi {
  constructor(private readonly injuryCases: InjuryCasesService) {
    super();
  }

  @ApiResponse({ status: 501, description: 'Contract only' })
  @Post('medical-records/:id/injuries')
  @ApiOperation({
    summary: 'Add injury marker to medical record',
    operationId: 'MedicalController_addInjury',
  })
  addInjury(
    @CurrentUser() _actor: Actor,
    @Param('id', ParseUUIDPipe) _id: string,
    @Body() _body: CreateInjuryDto,
  ) {
    return this.pending();
  }

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
      'Head Trainer: chỉ ngựa trong khu mình. Horse Owner: chỉ ngựa đang sở hữu, xem đầy đủ.',
    operationId: 'MedicalController_listInjuries',
  })
  @ApiOkResponse({ type: [InjuryMarkerResponseDto] })
  listInjuries(
    @CurrentUser() actor: Actor,
    @Param('horseId', ParseUUIDPipe) horseId: string,
  ): Promise<InjuryMarkerResponseDto[]> {
    return this.injuryCases.listInjuries(actor, horseId);
  }
}
