import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Access, CurrentUser } from '../../../common/decorators';
import type { Actor } from '../../../common/types/actor';
import { UserRole } from '../../users/user.enums';
import {
  CreateTimeTrialDto,
  TimeTrialResponseDto,
  UpdateTimeTrialDto,
} from '../dto/time-trial.dto';
import { TimeTrialsService } from './time-trials.service';

@ApiTags('training')
@ApiBearerAuth()
@Controller()
export class TimeTrialsController {
  constructor(private readonly timeTrials: TimeTrialsService) {}

  @Get('training-sessions/:id/time-trial')
  @ApiOkResponse({ type: TimeTrialResponseDto })
  getBySession(
    @CurrentUser() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.timeTrials.getBySession(actor, id);
  }

  @Access([UserRole.HEAD_TRAINER, UserRole.CLUB_MANAGER])
  @Post('training-sessions/:id/time-trial')
  @ApiCreatedResponse({ type: TimeTrialResponseDto })
  create(
    @CurrentUser() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: CreateTimeTrialDto,
  ) {
    return this.timeTrials.create(actor, id, body);
  }

  @Access([UserRole.HEAD_TRAINER, UserRole.CLUB_MANAGER])
  @Patch('training-sessions/:id/time-trial')
  @ApiOkResponse({ type: TimeTrialResponseDto })
  update(
    @CurrentUser() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateTimeTrialDto,
  ) {
    return this.timeTrials.update(actor, id, body);
  }

  @Get('time-trials/:id')
  @ApiOkResponse({ type: TimeTrialResponseDto })
  get(@CurrentUser() actor: Actor, @Param('id', ParseUUIDPipe) id: string) {
    return this.timeTrials.get(actor, id);
  }
}
