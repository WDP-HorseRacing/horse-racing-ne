import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { PendingApi } from '../../../common/api/pending-api';
import { CreateChecklistDto } from '../dto/create-checklist.dto';
import { CreateFeedingPlanDto } from '../dto/create-feeding-plan.dto';
import { CreateStableAssignmentDto } from '../dto/create-stable-assignment.dto';
import { CreateStallDto } from '../dto/create-stall.dto';
import { UpdateIncidentStatusDto } from '../dto/update-incident-status.dto';

@ApiTags('stable')
@ApiBearerAuth()
@ApiResponse({ status: 501, description: 'Contract only' })
@Controller()
export class StableDetailsController extends PendingApi {
  @Get('stalls')
  @ApiOperation({ summary: 'List club stalls' })
  stalls() {
    return this.pending();
  }

  @Post('stalls')
  @ApiOperation({ summary: 'Create stall' })
  createStall(@Body() _body: CreateStallDto) {
    return this.pending();
  }

  @Get('stalls/:id')
  @ApiOperation({ summary: 'Get stall' })
  stall(@Param('id') _id: string) {
    return this.pending();
  }

  @Patch('stalls/:id')
  @ApiOperation({ summary: 'Update stall' })
  updateStall(@Param('id') _id: string, @Body() _body: CreateStallDto) {
    return this.pending();
  }

  @Delete('stalls/:id')
  @ApiOperation({ summary: 'Soft-delete stall' })
  deleteStall(@Param('id') _id: string) {
    return this.pending();
  }

  @Get('stalls/:id/assignments')
  @ApiOperation({ summary: 'List stall assignment history' })
  assignments(@Param('id') _id: string) {
    return this.pending();
  }

  @Post('stalls/:id/assignments')
  @ApiOperation({ summary: 'Assign horse and groom to stall' })
  assign(@Param('id') _id: string, @Body() _body: CreateStableAssignmentDto) {
    return this.pending();
  }

  @Post('stable-assignments/:id/end')
  @ApiOperation({ summary: 'End stable assignment' })
  endAssignment(@Param('id') _id: string) {
    return this.pending();
  }

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

  @Get('horses/:horseId/checklists')
  @ApiOperation({ summary: 'List horse daily checklists' })
  checklists(@Param('horseId') _horseId: string) {
    return this.pending();
  }

  @Post('horses/:horseId/checklists')
  @ApiOperation({ summary: 'Create assigned daily checklist' })
  createChecklist(
    @Param('horseId') _horseId: string,
    @Body() _body: CreateChecklistDto,
  ) {
    return this.pending();
  }

  @Get('incidents')
  @ApiOperation({ summary: 'List stable incidents' })
  incidents() {
    return this.pending();
  }

  @Get('incidents/:id')
  @ApiOperation({ summary: 'Get stable incident' })
  incident(@Param('id') _id: string) {
    return this.pending();
  }

  @Patch('incidents/:id/status')
  @ApiOperation({ summary: 'Update incident resolution status' })
  incidentStatus(
    @Param('id') _id: string,
    @Body() _body: UpdateIncidentStatusDto,
  ) {
    return this.pending();
  }
}
