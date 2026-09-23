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
import { CreateMedicalRecordDto } from '../dto/create-medical-record.dto';
import { CreatePrescriptionDto } from '../dto/create-prescription.dto';
import { MedicalRecordResponseDto } from '../dto/medical-record.response.dto';
import { MedicalRecordsService } from './medical-records.service';

@ApiTags('medical')
@ApiBearerAuth()
@Controller()
export class MedicalRecordsController extends PendingApi {
  constructor(private readonly medicalRecords: MedicalRecordsService) {
    super();
  }

  @Access([
    UserRole.CLUB_MANAGER,
    UserRole.HEAD_TRAINER,
    UserRole.VETERINARIAN,
    UserRole.HORSE_OWNER,
  ])
  @Get('horses/:horseId/medical-records')
  @ApiOperation({
    summary: 'List horse medical records',
    description:
      'Head Trainer: chỉ ngựa trong khu mình. Horse Owner: chỉ ngựa đang sở hữu, đơn thuốc không có dosage và frequency.',
    operationId: 'MedicalController_listRecords',
  })
  @ApiOkResponse({ type: [MedicalRecordResponseDto] })
  listRecords(
    @CurrentUser() actor: Actor,
    @Param('horseId', ParseUUIDPipe) horseId: string,
  ): Promise<MedicalRecordResponseDto[]> {
    return this.medicalRecords.listRecords(actor, horseId);
  }

  @ApiResponse({ status: 501, description: 'Contract only' })
  @Post('horses/:horseId/medical-records')
  @ApiOperation({
    summary: 'Create append-only medical record',
    operationId: 'MedicalController_createRecord',
  })
  createRecord(
    @CurrentUser() _actor: Actor,
    @Param('horseId', ParseUUIDPipe) _horseId: string,
    @Body() _body: CreateMedicalRecordDto,
  ) {
    return this.pending();
  }

  @ApiResponse({ status: 501, description: 'Contract only' })
  @Post('medical-records/:id/prescriptions')
  @ApiOperation({
    summary: 'Add prescription to medical record',
    operationId: 'MedicalController_addPrescription',
  })
  addPrescription(
    @CurrentUser() _actor: Actor,
    @Param('id', ParseUUIDPipe) _id: string,
    @Body() _body: CreatePrescriptionDto,
  ) {
    return this.pending();
  }
}
