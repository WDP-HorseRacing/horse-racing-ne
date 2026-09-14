import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { PendingApi } from '../../../common/api/pending-api';
import { CreateTimeTrialDto } from '../dto/create-time-trial.dto';
import { UpdateTrainingSessionDto } from '../dto/update-training-session.dto';

@ApiTags('training')
@ApiBearerAuth()
@ApiResponse({ status: 501, description: 'Contract only' })
@Controller()
export class TrainingDetailsController extends PendingApi {
  @Get('training-plans/:id')
  @ApiOperation({ summary: 'Get training plan' })
  plan(@Param('id') _id: string) {
    return this.pending();
  }

  @Post('training-plans/:id/activate')
  @ApiOperation({ summary: 'Activate training plan' })
  activatePlan(@Param('id') _id: string) {
    return this.pending();
  }

  @Post('training-plans/:id/cancel')
  @ApiOperation({ summary: 'Cancel training plan' })
  cancelPlan(@Param('id') _id: string) {
    return this.pending();
  }

  @Get('training-plans/:id/sessions')
  @ApiOperation({ summary: 'List sessions in training plan' })
  sessions(@Param('id') _id: string) {
    return this.pending();
  }

  @Get('sessions/:id')
  @ApiOperation({ summary: 'Get training session' })
  session(@Param('id') _id: string) {
    return this.pending();
  }

  @Patch('sessions/:id')
  @ApiOperation({ summary: 'Reschedule or reassign training session' })
  updateSession(
    @Param('id') _id: string,
    @Body() _body: UpdateTrainingSessionDto,
  ) {
    return this.pending();
  }

  @Get('sessions/:id/evaluation')
  @ApiOperation({ summary: 'Get session evaluation' })
  evaluation(@Param('id') _id: string) {
    return this.pending();
  }

  @Get('sessions/:id/time-trials')
  @ApiOperation({ summary: 'List session time trials' })
  timeTrials(@Param('id') _id: string) {
    return this.pending();
  }

  @Post('sessions/:id/time-trials')
  @ApiOperation({ summary: 'Record session time trial' })
  createTimeTrial(@Param('id') _id: string, @Body() _body: CreateTimeTrialDto) {
    return this.pending();
  }

  @Get('time-trials/:id')
  @ApiOperation({ summary: 'Get time trial result and media' })
  timeTrial(@Param('id') _id: string) {
    return this.pending();
  }
}
