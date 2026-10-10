import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Access, CurrentUser } from '../../../common/decorators';
import type { Actor } from '../../../common/types/actor';
import { UserRole } from '../../users/user.enums';
import {
  CancelTrainingSessionDto,
  CreateTrainingSessionDto,
  PublishClassSessionsDto,
  PublishedSessionResponseDto,
  TrainingSessionResponseDto,
  UpdateTrainingSessionDto,
} from '../dto/training-session.dto';
import { TrainingSessionsService } from './training-sessions.service';

@ApiTags('training')
@ApiBearerAuth()
@Controller()
export class TrainingSessionsController {
  constructor(private readonly sessions: TrainingSessionsService) {}

  @Get('classes/:classId/sessions')
  @ApiOkResponse({ type: [TrainingSessionResponseDto] })
  list(
    @CurrentUser() actor: Actor,
    @Param('classId', ParseUUIDPipe) classId: string,
  ) {
    return this.sessions.listSessions(actor, classId);
  }

  @Access([UserRole.HEAD_TRAINER])
  @Post('classes/:classId/sessions')
  @ApiCreatedResponse({ type: TrainingSessionResponseDto })
  create(
    @CurrentUser() actor: Actor,
    @Param('classId', ParseUUIDPipe) classId: string,
    @Body() body: CreateTrainingSessionDto,
  ) {
    return this.sessions.createSession(actor, classId, body);
  }

  @Access([UserRole.HEAD_TRAINER])
  @Post('classes/:classId/sessions/publish')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Publish một lần mọi buổi nháp của lớp, hoặc trong một khoảng ngày',
  })
  @ApiOkResponse({ type: [PublishedSessionResponseDto] })
  publishMany(
    @CurrentUser() actor: Actor,
    @Param('classId', ParseUUIDPipe) classId: string,
    @Body() body: PublishClassSessionsDto,
  ) {
    return this.sessions.publishClassSessions(actor, classId, body);
  }

  @Get('training-sessions/:sessionId')
  @ApiOkResponse({ type: TrainingSessionResponseDto })
  get(@CurrentUser() actor: Actor, @Param('sessionId', ParseUUIDPipe) sessionId: string) {
    return this.sessions.getSessionById(actor, sessionId);
  }

  @Access([UserRole.HEAD_TRAINER])
  @Patch('training-sessions/:sessionId')
  @ApiOkResponse({ type: TrainingSessionResponseDto })
  update(
    @CurrentUser() actor: Actor,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Body() body: UpdateTrainingSessionDto,
  ) {
    return this.sessions.updateSession(actor, sessionId, body);
  }

  @Access([UserRole.HEAD_TRAINER])
  @Post('training-sessions/:sessionId/publish')
  @ApiCreatedResponse({ type: PublishedSessionResponseDto })
  publish(@CurrentUser() actor: Actor, @Param('sessionId', ParseUUIDPipe) sessionId: string) {
    return this.sessions.publishSession(actor, sessionId);
  }

  @Access([UserRole.HEAD_TRAINER])
  @Post('training-sessions/:sessionId/cancel')
  @ApiCreatedResponse({ type: TrainingSessionResponseDto })
  cancel(
    @CurrentUser() actor: Actor,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Body() body: CancelTrainingSessionDto,
  ) {
    return this.sessions.cancelSession(actor, sessionId, body);
  }
}
