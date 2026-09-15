import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { PendingApi } from '../../../common/openapi/pending-api';
import { CreateTrainingPlanDto } from '../dto/create-training-plan.dto';
import { CreateTrainingSessionDto } from '../dto/create-training-session.dto';
import { EvaluateSessionDto } from '../dto/evaluate-session.dto';
import { UpdateTrainingPlanDto } from '../dto/update-training-plan.dto';

@ApiTags('training')
@ApiBearerAuth()
@ApiResponse({ status: 501, description: 'Contract only' })
@Controller()
export class TrainingController extends PendingApi {
  @Get('horses/:horseId/training-plans')
  @ApiOperation({ summary: 'List horse training plans' })
  listPlans(@Param('horseId') _horseId: string) {
    return this.pending();
  }

  @Post('horses/:horseId/training-plans')
  @ApiOperation({ summary: 'Create training plan' })
  createPlan(
    @Param('horseId') _horseId: string,
    @Body() _body: CreateTrainingPlanDto,
  ) {
    return this.pending();
  }

  @Patch('training-plans/:id')
  @ApiOperation({ summary: 'Update training plan' })
  updatePlan(@Param('id') _id: string, @Body() _body: UpdateTrainingPlanDto) {
    return this.pending();
  }

  @Post('training-plans/:id/sessions')
  @ApiOperation({ summary: 'Schedule training session' })
  createSession(
    @Param('id') _id: string,
    @Body() _body: CreateTrainingSessionDto,
  ) {
    return this.pending();
  }

  @Post('sessions/:id/start')
  @ApiOperation({ summary: 'Start training session' })
  startSession(@Param('id') _id: string) {
    return this.pending();
  }

  @Post('sessions/:id/complete')
  @ApiOperation({ summary: 'Complete training session' })
  completeSession(@Param('id') _id: string) {
    return this.pending();
  }

  @Post('sessions/:id/cancel')
  @ApiOperation({ summary: 'Cancel training session' })
  cancelSession(@Param('id') _id: string) {
    return this.pending();
  }

  @Post('sessions/:id/evaluation')
  @ApiOperation({ summary: 'Evaluate completed session' })
  evaluateSession(@Param('id') _id: string, @Body() _body: EvaluateSessionDto) {
    return this.pending();
  }
}
