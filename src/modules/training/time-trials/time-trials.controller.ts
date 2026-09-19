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
import type { Actor } from '../../../common/types/actor';
import { UserRole } from '../../users/user.enums';
import {
  CreateTimeTrialDto,
  TimeTrialResponseDto,
} from '../dto/time-trial.dto';
import { TimeTrialsService } from './time-trials.service';

@ApiTags('training')
@ApiBearerAuth()
@Controller()
export class TimeTrialsController {
  constructor(private readonly timeTrials: TimeTrialsService) {}

  @Get('sessions/:id/time-trials')
  @ApiOperation({ summary: 'List session time trials' })
  @ApiOkResponse({ type: [TimeTrialResponseDto] })
  list(@CurrentUser() actor: Actor, @Param('id', ParseUUIDPipe) id: string) {
    return this.timeTrials.list(actor, id);
  }

  @Access([UserRole.GROOM, UserRole.HEAD_TRAINER, UserRole.CLUB_MANAGER])
  @Post('sessions/:id/time-trials')
  @ApiOperation({ summary: 'Record time trial during an active session' })
  @ApiCreatedResponse({ type: TimeTrialResponseDto })
  create(
    @CurrentUser() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: CreateTimeTrialDto,
  ) {
    return this.timeTrials.create(actor, id, body);
  }

  @Get('time-trials/:id')
  @ApiOperation({ summary: 'Get time trial result and media reference' })
  @ApiOkResponse({ type: TimeTrialResponseDto })
  get(@CurrentUser() actor: Actor, @Param('id', ParseUUIDPipe) id: string) {
    return this.timeTrials.get(actor, id);
  }
}
