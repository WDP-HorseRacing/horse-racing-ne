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
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../../../common/decorators';
import { PendingApi } from '../../../common/openapi/pending-api';
import type { Actor } from '../../../common/types/actor';
import { CreateFeedingPlanDto } from '../dto/feeding-plan.dto';

@ApiTags('stable')
@ApiBearerAuth()
@ApiResponse({ status: 501, description: 'Contract only' })
@Controller()
export class FeedingPlansController extends PendingApi {
  @Get('horses/:horseId/feeding-plans')
  @ApiOperation({ summary: 'List horse feeding plans' })
  feedingPlans(
    @CurrentUser() _actor: Actor,
    @Param('horseId', ParseUUIDPipe) _horseId: string,
  ) {
    return this.pending();
  }

  @Post('horses/:horseId/feeding-plans')
  @ApiOperation({ summary: 'Create feeding plan for approval' })
  createFeedingPlan(
    @CurrentUser() _actor: Actor,
    @Param('horseId', ParseUUIDPipe) _horseId: string,
    @Body() _body: CreateFeedingPlanDto,
  ) {
    return this.pending();
  }

  @Post('feeding-plans/:id/approve')
  @ApiOperation({ summary: 'Approve feeding plan as Trainer or Vet' })
  approveFeedingPlan(
    @CurrentUser() _actor: Actor,
    @Param('id', ParseUUIDPipe) _id: string,
  ) {
    return this.pending();
  }
}
