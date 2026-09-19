import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { PendingApi } from '../../../common/openapi/pending-api';
import { CreateFeedingPlanDto } from '../dto/feeding-plan.dto';

@ApiTags('stable')
@ApiBearerAuth()
@ApiResponse({ status: 501, description: 'Contract only' })
@Controller()
export class FeedingPlansController extends PendingApi {
  @Get('horses/:horseId/feeding-plans')
  @ApiOperation({ summary: 'List horse feeding plans' })
  feedingPlans(@Param('horseId') _horseId: string) {
    return this.pending();
  }

  @Post('horses/:horseId/feeding-plans')
  @ApiOperation({ summary: 'Create feeding plan for approval' })
  createFeedingPlan(
    @Param('horseId') _horseId: string,
    @Body() _body: CreateFeedingPlanDto,
  ) {
    return this.pending();
  }

  @Post('feeding-plans/:id/approve')
  @ApiOperation({ summary: 'Approve feeding plan as Trainer or Vet' })
  approveFeedingPlan(@Param('id') _id: string) {
    return this.pending();
  }
}
