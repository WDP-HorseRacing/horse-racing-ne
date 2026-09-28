import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Access, CurrentUser } from '../../../common/decorators';
import type { Actor } from '../../../common/types/actor';
import { UserRole } from '../../users/user.enums';
import {
  CancelTrainingPlanDto,
  CreateTrainingPlanDto,
  TrainingPlanResponseDto,
  UpdateTrainingPlanDto,
} from '../dto/training-plan.dto';
import { TrainingPlansService } from './training-plans.service';

@ApiTags('training')
@ApiBearerAuth()
@Controller()
export class TrainingPlansController {
  constructor(private readonly plans: TrainingPlansService) {}

  @Get('training-classes/:classId/plans')
  @ApiOkResponse({ type: [TrainingPlanResponseDto] })
  list(@CurrentUser() actor: Actor, @Param('classId', ParseUUIDPipe) classId: string) {
    return this.plans.listPlansByClass(actor, classId);
  }

  @Access([UserRole.HEAD_TRAINER, UserRole.CLUB_MANAGER])
  @Post('training-classes/:classId/plans')
  @ApiCreatedResponse({ type: TrainingPlanResponseDto })
  create(
    @CurrentUser() actor: Actor,
    @Param('classId', ParseUUIDPipe) classId: string,
    @Body() body: CreateTrainingPlanDto,
  ) {
    return this.plans.createTrainingPlan(actor, classId, body);
  }

  @Get('training-plans/:id')
  @ApiOkResponse({ type: TrainingPlanResponseDto })
  get(@CurrentUser() actor: Actor, @Param('id', ParseUUIDPipe) id: string) {
    return this.plans.getPlanById(actor, id);
  }

  @Access([UserRole.HEAD_TRAINER, UserRole.CLUB_MANAGER])
  @Patch('training-plans/:id')
  @ApiOkResponse({ type: TrainingPlanResponseDto })
  update(
    @CurrentUser() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateTrainingPlanDto,
  ) {
    return this.plans.updatePlan(actor, id, body);
  }

  @Access([UserRole.HEAD_TRAINER, UserRole.CLUB_MANAGER])
  @Post('training-plans/:id/activate')
  @ApiOkResponse({ type: TrainingPlanResponseDto })
  activate(@CurrentUser() actor: Actor, @Param('id', ParseUUIDPipe) id: string) {
    return this.plans.activatePlan(actor, id);
  }

  @Access([UserRole.HEAD_TRAINER, UserRole.CLUB_MANAGER])
  @Post('training-plans/:id/complete')
  @ApiOkResponse({ type: TrainingPlanResponseDto })
  complete(@CurrentUser() actor: Actor, @Param('id', ParseUUIDPipe) id: string) {
    return this.plans.completePlan(actor, id);
  }

  @Access([UserRole.HEAD_TRAINER, UserRole.CLUB_MANAGER])
  @Post('training-plans/:id/cancel')
  @ApiOkResponse({ type: TrainingPlanResponseDto })
  cancel(
    @CurrentUser() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: CancelTrainingPlanDto,
  ) {
    return this.plans.cancelPlan(actor, id, body);
  }
}
