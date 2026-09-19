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
  ApiOkResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Access, CurrentUser } from '../../../common/decorators';
import { UserRole } from '../../../common/enums/role.enum';
import { PendingApi } from '../../../common/openapi/pending-api';
import type { Actor } from '../../../common/types/actor';
import { CreateInjuryDto } from '../dto/create-injury.dto';
import { CreateMedicalRecordDto } from '../dto/create-medical-record.dto';
import { CreatePrescriptionDto } from '../dto/create-prescription.dto';
import { CreateTrainingLockDto } from '../dto/create-training-lock.dto';
import { InjuryMarkerResponseDto } from '../dto/injury-marker.response.dto';
import { MedicalRecordResponseDto } from '../dto/medical-record.response.dto';
import { ReleaseTrainingLockDto } from '../dto/release-training-lock.dto';
import { MedicalService } from '../services/medical.service';

@ApiTags('medical')
@ApiBearerAuth()
@Controller()
export class MedicalController extends PendingApi {
  constructor(private readonly medicalService: MedicalService) {
    super();
  }

  @Access([UserRole.CLUB_MANAGER, UserRole.HEAD_TRAINER, UserRole.VETERINARIAN])
  @Get('horses/:horseId/medical-records')
  @ApiOperation({ summary: 'List horse medical records' })
  @ApiOkResponse({ type: [MedicalRecordResponseDto] })
  listRecords(
    @CurrentUser() actor: Actor,
    @Param('horseId', ParseUUIDPipe) horseId: string,
  ): Promise<MedicalRecordResponseDto[]> {
    return this.medicalService.listRecords(actor, horseId);
  }

  @ApiResponse({ status: 501, description: 'Contract only' })
  @Post('horses/:horseId/medical-records')
  @ApiOperation({ summary: 'Create append-only medical record' })
  createRecord(
    @Param('horseId') _horseId: string,
    @Body() _body: CreateMedicalRecordDto,
  ) {
    return this.pending();
  }

  @ApiResponse({ status: 501, description: 'Contract only' })
  @Post('medical-records/:id/prescriptions')
  @ApiOperation({ summary: 'Add prescription to medical record' })
  addPrescription(
    @Param('id') _id: string,
    @Body() _body: CreatePrescriptionDto,
  ) {
    return this.pending();
  }

  @ApiResponse({ status: 501, description: 'Contract only' })
  @Post('medical-records/:id/injuries')
  @ApiOperation({ summary: 'Add injury marker to medical record' })
  addInjury(@Param('id') _id: string, @Body() _body: CreateInjuryDto) {
    return this.pending();
  }

  @Get('horses/:horseId/injuries')
  @ApiOperation({ summary: 'List horse injury timeline' })
  @Access([UserRole.CLUB_MANAGER, UserRole.HEAD_TRAINER, UserRole.VETERINARIAN])
  @ApiOkResponse({ type: [InjuryMarkerResponseDto] })
  listInjuries(
    @CurrentUser() actor: Actor,
    @Param('horseId', ParseUUIDPipe) horseId: string,
  ): Promise<InjuryMarkerResponseDto[]> {
    return this.medicalService.listInjuries(actor, horseId);
  }

  @ApiResponse({ status: 501, description: 'Contract only' })
  @Post('horses/:horseId/training-locks')
  @ApiOperation({ summary: 'Create veterinary training lock' })
  lock(
    @Param('horseId') _horseId: string,
    @Body() _body: CreateTrainingLockDto,
  ) {
    return this.pending();
  }

  @ApiResponse({ status: 501, description: 'Contract only' })
  @Post('training-locks/:id/release')
  @ApiOperation({ summary: 'Release veterinary training lock' })
  release(@Param('id') _id: string, @Body() _body: ReleaseTrainingLockDto) {
    return this.pending();
  }
}
