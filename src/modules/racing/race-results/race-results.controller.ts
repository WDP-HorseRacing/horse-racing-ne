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
import { RecordResultDto } from '../dto/record-result.dto';
import { RaceResultsService } from './race-results.service';

@ApiTags('racing')
@ApiBearerAuth()
@Controller()
export class RaceResultsController extends PendingApi {
  constructor(private readonly raceResults: RaceResultsService) {
    super();
  }

  @Get('races/:id/results')
  @ApiResponse({ status: 501, description: 'Contract only' })
  @ApiOperation({
    summary: 'Get race results',
    operationId: 'RacingDetailsController_results',
  })
  results(
    @CurrentUser() _actor: Actor,
    @Param('id', ParseUUIDPipe) _id: string,
  ) {
    return this.pending();
  }

  @Access([UserRole.CLUB_MANAGER, UserRole.HEAD_TRAINER, UserRole.HORSE_OWNER])
  @Get('horses/:horseId/race-results')
  @ApiOperation({
    summary: 'Get horse race history',
    operationId: 'RacingDetailsController_horseResults',
  })
  @ApiOkResponse({ type: [HorseRaceResultResponseDto] })
  horseResults(
    @CurrentUser() actor: Actor,
    @Param('horseId', ParseUUIDPipe) horseId: string,
  ): Promise<HorseRaceResultResponseDto[]> {
    return this.raceResults.listHorseResults(actor, horseId);
  }

  @Patch('races/:id/registrations/:registrationId/result')
  @ApiResponse({ status: 501, description: 'Contract only' })
  @ApiOperation({
    summary: 'Record race result for registration',
    operationId: 'RacingController_recordResult',
  })
  record(
    @CurrentUser() _actor: Actor,
    @Param('id', ParseUUIDPipe) _id: string,
    @Param('registrationId', ParseUUIDPipe) _registrationId: string,
    @Body() _body: RecordResultDto,
  ) {
    return this.pending();
  }
}
