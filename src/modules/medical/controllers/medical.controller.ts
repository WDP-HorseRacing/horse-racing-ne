import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { PendingApi } from '../../../common/openapi/pending-api';
import { CreateInjuryDto } from '../dto/create-injury.dto';
import { CreateMedicalRecordDto } from '../dto/create-medical-record.dto';
import { CreatePrescriptionDto } from '../dto/create-prescription.dto';
import { CreateTrainingLockDto } from '../dto/create-training-lock.dto';
import { ReleaseTrainingLockDto } from '../dto/release-training-lock.dto';

@ApiTags('medical')
@ApiBearerAuth()
@ApiResponse({ status: 501, description: 'Contract only' })
@Controller()
export class MedicalController extends PendingApi {
  @Get('horses/:horseId/medical-records')
  @ApiOperation({ summary: 'List horse medical records' })
  listRecords(@Param('horseId') _horseId: string) {
    return this.pending();
  }

  @Post('horses/:horseId/medical-records')
  @ApiOperation({ summary: 'Create append-only medical record' })
  createRecord(
    @Param('horseId') _horseId: string,
    @Body() _body: CreateMedicalRecordDto,
  ) {
    return this.pending();
  }

  @Post('medical-records/:id/prescriptions')
  @ApiOperation({ summary: 'Add prescription to medical record' })
  addPrescription(
    @Param('id') _id: string,
    @Body() _body: CreatePrescriptionDto,
  ) {
    return this.pending();
  }

  @Post('medical-records/:id/injuries')
  @ApiOperation({ summary: 'Add injury marker to medical record' })
  addInjury(@Param('id') _id: string, @Body() _body: CreateInjuryDto) {
    return this.pending();
  }

  @Get('horses/:horseId/injuries')
  @ApiOperation({ summary: 'List horse injury timeline' })
  listInjuries(@Param('horseId') _horseId: string) {
    return this.pending();
  }

  @Post('horses/:horseId/training-locks')
  @ApiOperation({ summary: 'Create veterinary training lock' })
  lock(
    @Param('horseId') _horseId: string,
    @Body() _body: CreateTrainingLockDto,
  ) {
    return this.pending();
  }

  @Post('training-locks/:id/release')
  @ApiOperation({ summary: 'Release veterinary training lock' })
  release(@Param('id') _id: string, @Body() _body: ReleaseTrainingLockDto) {
    return this.pending();
  }
}
