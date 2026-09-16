import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
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
import { HorseRaceResultResponseDto } from '../dto/horse-race-result.response.dto';
import { UpdateRaceDto } from '../dto/update-race.dto';
import { RacingService } from '../services/racing.service';

@ApiTags('racing')
@ApiBearerAuth()
@Controller()
export class RacingDetailsController extends PendingApi {
  constructor(private readonly racingService: RacingService) {
    super();
  }

  @ApiResponse({ status: 501, description: 'Contract only' })
  @Get('races/:id')
  @ApiOperation({ summary: 'Get race and conditions' })
  race(@Param('id') _id: string) {
    return this.pending();
  }

  @ApiResponse({ status: 501, description: 'Contract only' })
  @Patch('races/:id')
  @ApiOperation({ summary: 'Update race before registration closes' })
  updateRace(@Param('id') _id: string, @Body() _body: UpdateRaceDto) {
    return this.pending();
  }

  @ApiResponse({ status: 501, description: 'Contract only' })
  @Get('races/:id/registrations')
  @ApiOperation({ summary: 'List race registrations' })
  registrations(@Param('id') _id: string) {
    return this.pending();
  }

  @ApiResponse({ status: 501, description: 'Contract only' })
  @Get('races/:id/registrations/:registrationId')
  @ApiOperation({ summary: 'Get race registration and approvals' })
  registration(
    @Param('id') _id: string,
    @Param('registrationId') _registrationId: string,
  ) {
    return this.pending();
  }

  @ApiResponse({ status: 501, description: 'Contract only' })
  @Get('races/:id/results')
  @ApiOperation({ summary: 'Get race results' })
  results(@Param('id') _id: string) {
    return this.pending();
  }

  @Access([UserRole.CLUB_MANAGER, UserRole.HEAD_TRAINER, UserRole.HORSE_OWNER])
  @Get('horses/:horseId/race-results')
  @ApiOperation({ summary: 'Get horse race history' })
  @ApiOkResponse({ type: [HorseRaceResultResponseDto] })
  horseResults(
    @CurrentUser() actor: Actor,
    @Param('horseId', ParseUUIDPipe) horseId: string,
  ): Promise<HorseRaceResultResponseDto[]> {
    return this.racingService.listHorseResults(actor, horseId);
  }
}
