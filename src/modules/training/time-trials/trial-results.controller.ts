import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Access, CurrentUser } from '../../../common/decorators';
import type { Actor } from '../../../common/types/actor';
import { UserRole } from '../../users/user.enums';
import {
  CreateTrialResultDto,
  TrialResultResponseDto,
} from '../dto/time-trial.dto';
import { TrialResultsService } from './trial-results.service';

@ApiTags('training')
@ApiBearerAuth()
@Controller()
export class TrialResultsController {
  constructor(private readonly results: TrialResultsService) {}

  @Get('session-participants/:id/trial-results')
  @ApiOkResponse({ type: [TrialResultResponseDto] })
  list(@CurrentUser() actor: Actor, @Param('id', ParseUUIDPipe) id: string) {
    return this.results.list(actor, id);
  }

  @Access([UserRole.GROOM, UserRole.HEAD_TRAINER])
  @Post('session-participants/:id/trial-results')
  @ApiCreatedResponse({ type: TrialResultResponseDto })
  create(
    @CurrentUser() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: CreateTrialResultDto,
  ) {
    return this.results.create(actor, id, body);
  }
}
