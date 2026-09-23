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
import { VoidMedicalRecordDto } from '../dto/void-medical-record.dto';

/**
 * Owns detail and void routes for medical records.
 * These routes remain contract-only until their write workflows are added.
 */
@ApiTags('medical')
@ApiBearerAuth()
@ApiResponse({ status: 501, description: 'Contract only' })
@Controller()
export class MedicalRecordDetailsController extends PendingApi {
  @Get('medical-records/:id')
  @ApiOperation({
    summary: 'Get medical record',
    operationId: 'MedicalDetailsController_record',
  })
  record(
    @CurrentUser() _actor: Actor,
    @Param('id', ParseUUIDPipe) _id: string,
  ) {
    return this.pending();
  }

  @Post('medical-records/:id/void')
  @ApiOperation({
    summary: 'Void medical record with reason',
    operationId: 'MedicalDetailsController_voidRecord',
  })
  voidRecord(
    @CurrentUser() _actor: Actor,
    @Param('id', ParseUUIDPipe) _id: string,
    @Body() _body: VoidMedicalRecordDto,
  ) {
    return this.pending();
  }
}
