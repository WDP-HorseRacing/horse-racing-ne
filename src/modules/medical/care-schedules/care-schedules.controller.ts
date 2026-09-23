import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
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
import { CreateCareScheduleDto } from '../dto/create-care-schedule.dto';
import { UpdateCareScheduleDto } from '../dto/update-care-schedule.dto';

@ApiTags('medical')
@ApiBearerAuth()
@ApiResponse({ status: 501, description: 'Contract only' })
@Controller()
export class CareSchedulesController extends PendingApi {
  @Get('horses/:horseId/care-schedules')
  @ApiOperation({
    summary: 'List vaccination, deworming and farrier schedule',
    operationId: 'MedicalDetailsController_careSchedules',
  })
  list(
    @CurrentUser() _actor: Actor,
    @Param('horseId', ParseUUIDPipe) _horseId: string,
  ) {
    return this.pending();
  }

  @Post('horses/:horseId/care-schedules')
  @ApiOperation({
    summary: 'Schedule veterinary care',
    operationId: 'MedicalDetailsController_createCareSchedule',
  })
  create(
    @CurrentUser() _actor: Actor,
    @Param('horseId', ParseUUIDPipe) _horseId: string,
    @Body() _body: CreateCareScheduleDto,
  ) {
    return this.pending();
  }

  @Patch('care-schedules/:id')
  @ApiOperation({
    summary: 'Update veterinary care schedule',
    operationId: 'MedicalDetailsController_updateCareSchedule',
  })
  update(
    @CurrentUser() _actor: Actor,
    @Param('id', ParseUUIDPipe) _id: string,
    @Body() _body: UpdateCareScheduleDto,
  ) {
    return this.pending();
  }

  @Post('care-schedules/:id/complete')
  @ApiOperation({
    summary: 'Complete veterinary care item',
    operationId: 'MedicalDetailsController_completeCareSchedule',
  })
  complete(
    @CurrentUser() _actor: Actor,
    @Param('id', ParseUUIDPipe) _id: string,
  ) {
    return this.pending();
  }
}
