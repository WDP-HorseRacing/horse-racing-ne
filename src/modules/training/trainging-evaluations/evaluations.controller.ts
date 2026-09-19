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
import {
  EvaluateSessionDto,
  SessionEvaluationResponseDto,
} from '../dto/training-session.dto';
import { EvaluationsService } from './evaluations.service';
import { UserRole } from '../../../common/enums';

@ApiTags('training')
@ApiBearerAuth()
@Controller()
export class EvaluationsController {
  constructor(private readonly evaluations: EvaluationsService) {}

  @Access([UserRole.HEAD_TRAINER, UserRole.CLUB_MANAGER])
  @Post('sessions/:id/evaluation')
  @ApiOperation({ summary: 'Evaluate completed session' })
  @ApiCreatedResponse({ type: SessionEvaluationResponseDto })
  create(
    @CurrentUser() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: EvaluateSessionDto,
  ) {
    return this.evaluations.create(actor, id, body);
  }

  @Get('sessions/:id/evaluation')
  @ApiOperation({ summary: 'Get session evaluation' })
  @ApiOkResponse({ type: SessionEvaluationResponseDto })
  get(@CurrentUser() actor: Actor, @Param('id', ParseUUIDPipe) id: string) {
    return this.evaluations.get(actor, id);
  }
}
