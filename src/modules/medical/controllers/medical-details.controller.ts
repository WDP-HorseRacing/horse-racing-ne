import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { PendingApi } from '../../../common/openapi/pending-api';
import { CreateCareScheduleDto } from '../dto/create-care-schedule.dto';
import { RecordRecoveryDto } from '../dto/record-recovery.dto';
import { UpdateCareScheduleDto } from '../dto/update-care-schedule.dto';
import { VoidMedicalRecordDto } from '../dto/void-medical-record.dto';
import { UpdateTrainingLockDto } from '../dto/update-training-lock.dto';

@ApiTags('medical')
@ApiBearerAuth()
@ApiResponse({ status: 501, description: 'Contract only' })
@Controller()
export class MedicalDetailsController extends PendingApi {
  @Get('medical-records/:id')
  @ApiOperation({ summary: 'Get medical record' })
  record(@Param('id') _id: string) {
    return this.pending();
  }

  @Post('medical-records/:id/void')
  @ApiOperation({ summary: 'Void medical record with reason' })
  voidRecord(@Param('id') _id: string, @Body() _body: VoidMedicalRecordDto) {
    return this.pending();
  }

  @Get('injury-cases/:id/timeline')
  @ApiOperation({ summary: 'Get append-only injury recovery timeline' })
  injuryTimeline(@Param('id') _id: string) {
    return this.pending();
  }

  @Post('injury-cases/:id/recovery-events')
  @ApiOperation({ summary: 'Append injury recovery event' })
  recordRecovery(@Param('id') _id: string, @Body() _body: RecordRecoveryDto) {
    return this.pending();
  }

  @Get('horses/:horseId/training-locks')
  @ApiOperation({ summary: 'List horse training lock history' })
  locks(@Param('horseId') _horseId: string) {
    return this.pending();
  }

  @Get('training-locks/:id')
  @ApiOperation({ summary: 'Get training lock details' })
  lock(@Param('id') _id: string) {
    return this.pending();
  }

  @Patch('training-locks/:id')
  @ApiOperation({ summary: 'Update active veterinary training lock' })
  updateLock(@Param('id') _id: string, @Body() _body: UpdateTrainingLockDto) {
    return this.pending();
  }

  @Get('horses/:horseId/care-schedules')
  @ApiOperation({ summary: 'List vaccination, deworming and farrier schedule' })
  careSchedules(@Param('horseId') _horseId: string) {
    return this.pending();
  }

  @Post('horses/:horseId/care-schedules')
  @ApiOperation({ summary: 'Schedule veterinary care' })
  createCareSchedule(
    @Param('horseId') _horseId: string,
    @Body() _body: CreateCareScheduleDto,
  ) {
    return this.pending();
  }

  @Patch('care-schedules/:id')
  @ApiOperation({ summary: 'Update veterinary care schedule' })
  updateCareSchedule(
    @Param('id') _id: string,
    @Body() _body: UpdateCareScheduleDto,
  ) {
    return this.pending();
  }

  @Post('care-schedules/:id/complete')
  @ApiOperation({ summary: 'Complete veterinary care item' })
  completeCareSchedule(@Param('id') _id: string) {
    return this.pending();
  }
}
