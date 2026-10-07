import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Access, CurrentUser } from '../../../common/decorators';
import type { Actor } from '../../../common/types/actor';
import { UserRole } from '../../../common/enums';
import {
  CreatePerformanceEvaluationDto,
  PerformanceEvaluationResponseDto,
} from '../dto/performance-evaluation.dto';
import { PerformanceEvaluationsService } from './performance-evaluations.service';

@ApiTags('performance')
@ApiBearerAuth()
@Controller()
export class PerformanceEvaluationsController {
  constructor(private readonly evaluations: PerformanceEvaluationsService) {}

  @Access([UserRole.HEAD_TRAINER])
  @Post('session-participants/:id/evaluation')
  @ApiCreatedResponse({ type: PerformanceEvaluationResponseDto })
  create(
    @CurrentUser() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: CreatePerformanceEvaluationDto,
  ) {
    return this.evaluations.create(actor, id, body);
  }

  @Get('session-participants/:id/evaluation')
  @ApiOkResponse({ type: PerformanceEvaluationResponseDto })
  get(@CurrentUser() actor: Actor, @Param('id', ParseUUIDPipe) id: string) {
    return this.evaluations.get(actor, id);
  }
}
