import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Access, CurrentUser } from '../../../common/decorators';
import type { Actor } from '../../../common/types/actor';
import { UserRole } from '../../users/user.enums';
import {
  AssignParticipantGroomDto,
  MarkParticipantAbsentDto,
  SessionParticipantResponseDto,
} from '../dto/session-participant.dto';
import { SessionParticipantsService } from './session-participants.service';

@ApiTags('training')
@ApiBearerAuth()
@Controller()
export class SessionParticipantsController {
  constructor(private readonly participants: SessionParticipantsService) {}

  @Get('training-sessions/:sessionId/participants')
  @ApiOkResponse({ type: [SessionParticipantResponseDto] })
  list(
    @CurrentUser() actor: Actor,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
  ) {
    return this.participants.list(actor, sessionId);
  }

  @Access([UserRole.HEAD_TRAINER, UserRole.CLUB_MANAGER])
  @Patch('session-participants/:id/groom')
  @ApiOkResponse({ type: SessionParticipantResponseDto })
  assignGroom(
    @CurrentUser() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: AssignParticipantGroomDto,
  ) {
    return this.participants.assignGroom(actor, id, body);
  }

  @Access([UserRole.GROOM, UserRole.HEAD_TRAINER, UserRole.CLUB_MANAGER])
  @Post('session-participants/:id/check-in')
  @ApiOkResponse({ type: SessionParticipantResponseDto })
  checkIn(@CurrentUser() actor: Actor, @Param('id', ParseUUIDPipe) id: string) {
    return this.participants.checkIn(actor, id);
  }

  @Access([UserRole.GROOM, UserRole.HEAD_TRAINER, UserRole.CLUB_MANAGER])
  @Post('session-participants/:id/absent')
  @ApiOkResponse({ type: SessionParticipantResponseDto })
  absent(
    @CurrentUser() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: MarkParticipantAbsentDto,
  ) {
    return this.participants.absent(actor, id, body);
  }

  @Access([UserRole.GROOM, UserRole.HEAD_TRAINER, UserRole.CLUB_MANAGER])
  @Post('session-participants/:id/ready')
  @ApiOkResponse({ type: SessionParticipantResponseDto })
  ready(@CurrentUser() actor: Actor, @Param('id', ParseUUIDPipe) id: string) {
    return this.participants.ready(actor, id);
  }

  @Access([UserRole.GROOM, UserRole.HEAD_TRAINER, UserRole.CLUB_MANAGER])
  @Post('session-participants/:id/start')
  @ApiOkResponse({ type: SessionParticipantResponseDto })
  start(@CurrentUser() actor: Actor, @Param('id', ParseUUIDPipe) id: string) {
    return this.participants.start(actor, id);
  }

  @Access([UserRole.GROOM, UserRole.HEAD_TRAINER, UserRole.CLUB_MANAGER])
  @Post('session-participants/:id/complete')
  @ApiOkResponse({ type: SessionParticipantResponseDto })
  complete(
    @CurrentUser() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.participants.complete(actor, id);
  }
}
