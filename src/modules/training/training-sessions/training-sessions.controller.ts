import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
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
import {
  CancelTrainingSessionDto,
  CompleteTrainingSessionDto,
  CreateTrainingSessionDto,
  TrainingSessionResponseDto,
  UpdateTrainingSessionDto,
} from '../dto/training-session.dto';
import { TrainingSessionsService } from './training-sessions.service';
import { UserRole } from '../../users/user.enums';

@ApiTags('training')
@ApiBearerAuth()
@Controller()
export class TrainingSessionsController {
  constructor(private readonly sessions: TrainingSessionsService) {}

  //
  @Get('training-plans/:id/sessions')
  @ApiOperation({ summary: 'List sessions in training plan' })
  @ApiOkResponse({ type: [TrainingSessionResponseDto] })
  list(
    @CurrentUser() actor: Actor,
    @Param('id', ParseUUIDPipe) planId: string,
  ) {
    return this.sessions.listSessions(actor, planId);
  }

  //
  @Access([UserRole.HEAD_TRAINER, UserRole.CLUB_MANAGER])
  @Post('training-plans/:id/sessions')
  @ApiOperation({ summary: 'Schedule training session' })
  @ApiCreatedResponse({ type: TrainingSessionResponseDto })
  create(
    @CurrentUser() actor: Actor,
    @Param('id', ParseUUIDPipe) planId: string,
    @Body() body: CreateTrainingSessionDto,
  ) {
    return this.sessions.createSession(actor, planId, body);
  }

  //
  @Get('sessions/:id')
  @ApiOperation({ summary: 'Get training session' })
  @ApiOkResponse({ type: TrainingSessionResponseDto })
  get(
    @CurrentUser() actor: Actor,
    @Param('id', ParseUUIDPipe) sessionId: string,
  ) {
    return this.sessions.getSessionById(actor, sessionId);
  }

  //
  @Access([UserRole.HEAD_TRAINER, UserRole.CLUB_MANAGER])
  @Patch('sessions/:id')
  @ApiOperation({ summary: 'Reschedule or reassign a scheduled session' })
  @ApiOkResponse({ type: TrainingSessionResponseDto })
  update(
    @CurrentUser() actor: Actor,
    @Param('id', ParseUUIDPipe) sessionId: string,
    @Body() body: UpdateTrainingSessionDto,
  ) {
    return this.sessions.updateSession(actor, sessionId, body);
  }

  //
  @Access([UserRole.GROOM, UserRole.HEAD_TRAINER, UserRole.CLUB_MANAGER])
  @Post('sessions/:id/start')
  @ApiOperation({ summary: 'Start training session' })
  @ApiOkResponse({ type: TrainingSessionResponseDto })
  start(
    @CurrentUser() actor: Actor,
    @Param('id', ParseUUIDPipe) sessionId: string,
  ) {
    return this.sessions.startSession(actor, sessionId);
  }

  @Access([UserRole.GROOM, UserRole.HEAD_TRAINER, UserRole.CLUB_MANAGER])
  @Post('sessions/:id/complete')
  @ApiOperation({
    summary: 'Complete training session and record actual result',
  })
  @ApiOkResponse({ type: TrainingSessionResponseDto })
  complete(
    @CurrentUser() actor: Actor,
    @Param('id', ParseUUIDPipe) sessionId: string,
    @Body() body: CompleteTrainingSessionDto,
  ) {
    return this.sessions.completeSession(actor, sessionId, body);
  }

  @Access([UserRole.GROOM, UserRole.HEAD_TRAINER, UserRole.CLUB_MANAGER])
  @Post('sessions/:id/cancel')
  @ApiOperation({ summary: 'Cancel training session with a reason' })
  @ApiOkResponse({ type: TrainingSessionResponseDto })
  cancel(
    @CurrentUser() actor: Actor,
    @Param('id', ParseUUIDPipe) sessionId: string,
    @Body() body: CancelTrainingSessionDto,
  ) {
    return this.sessions.cancelSession(actor, sessionId, body);
  }
}
