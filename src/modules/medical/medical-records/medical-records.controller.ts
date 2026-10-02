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
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Access, CurrentUser } from '../../../common/decorators';
import { UserRole } from '../../../common/enums/role.enum';
import type { Actor } from '../../../common/types/actor';
import {
  CareInstructionsResponseDto,
  CreateStandaloneVisitDto,
  MedicalRecordResponseDto,
  VoidMedicalRecordDto,
} from '../dto';
import { MedicalRecordsService } from './medical-records.service';
import { MedicalVisitsService } from './medical-visits.service';
import { MEDICAL_READER_ROLES } from '../constants/medical.constants';

@ApiTags('medical')
@ApiBearerAuth()
@Controller()
export class MedicalRecordsController {
  constructor(
    private readonly medicalRecords: MedicalRecordsService,
    private readonly visits: MedicalVisitsService,
  ) {}

  @Access(MEDICAL_READER_ROLES)
  @Get('horses/:horseId/medical-records')
  @ApiOperation({
    summary: 'List horse medical visits',
    description:
      'Mọi buổi khám trong và ngoài bệnh án, kể cả buổi đã hủy, mới nhất lên trên. Head Trainer, Veterinarian, Club Manager: toàn câu lạc bộ. Horse Owner: chỉ ngựa đang sở hữu, đơn thuốc không có dosage và frequency. Groom không xem.',
    operationId: 'MedicalController_listRecords',
  })
  @ApiOkResponse({ type: [MedicalRecordResponseDto] })
  listRecords(
    @CurrentUser() actor: Actor,
    @Param('horseId', ParseUUIDPipe) horseId: string,
  ): Promise<MedicalRecordResponseDto[]> {
    return this.medicalRecords.listRecords(actor, horseId);
  }

  @Access([UserRole.VETERINARIAN])
  @Post('horses/:horseId/medical-records')
  @ApiOperation({
    summary: 'Record a medical visit outside a case (F3.3)',
    description:
      'Khám định kỳ (ROUTINE) hoặc theo yêu cầu (REQUEST). Kết luận ISSUE bắt buộc initialDiagnosis và mở bệnh án ngay (F3.5). Ngựa đang có bệnh án mở: 409. Số đo bất thường chưa xác nhận: 422.',
    operationId: 'MedicalController_createRecord',
  })
  @ApiCreatedResponse({ type: MedicalRecordResponseDto })
  createRecord(
    @CurrentUser() actor: Actor,
    @Param('horseId', ParseUUIDPipe) horseId: string,
    @Body() body: CreateStandaloneVisitDto,
  ): Promise<MedicalRecordResponseDto> {
    return this.visits.createStandaloneVisit(actor, horseId, body);
  }

  @Access([...MEDICAL_READER_ROLES, UserRole.GROOM])
  @Get('horses/:horseId/care-instructions')
  @ApiOperation({
    summary: 'Get the current care instructions of a horse',
    description:
      'Ghi chú chăm sóc và hạn chế vận động đang hiệu lực (của buổi khám gần nhất chưa hủy), để hiện trong hồ sơ ngựa. Groom chỉ xem ngựa mình phụ trách (403 nếu không). current = null khi ngựa chưa được khám hoặc buổi gần nhất để trống ghi chú. Không trả chẩn đoán, thuốc hay chi phí.',
  })
  @ApiOkResponse({ type: CareInstructionsResponseDto })
  careInstructions(
    @CurrentUser() actor: Actor,
    @Param('horseId', ParseUUIDPipe) horseId: string,
  ): Promise<CareInstructionsResponseDto> {
    return this.medicalRecords.getCareInstructions(actor, horseId);
  }

  @Access(MEDICAL_READER_ROLES)
  @Get('medical-records/:id')
  @ApiOperation({
    summary: 'Get a medical visit',
    operationId: 'MedicalDetailsController_record',
  })
  @ApiOkResponse({ type: MedicalRecordResponseDto })
  record(
    @CurrentUser() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<MedicalRecordResponseDto> {
    return this.medicalRecords.getRecord(actor, id);
  }

  @Access([UserRole.VETERINARIAN])
  @Post('medical-records/:id/void')
  @ApiOperation({
    summary: 'Void a wrongly recorded medical visit (F3.6)',
    description:
      'Bắt buộc lý do. Số đo của buổi khám bị gỡ khỏi F1.5. Buổi tái khám hủy được cả khi bệnh án đã đóng. Buổi mở bệnh án chỉ hủy được khi bệnh án còn Đang điều trị và không còn buổi nào khác chưa hủy; khi đó bệnh án chuyển Đã hủy. Hủy buổi đã hủy, hoặc buổi mở bệnh án không thỏa điều kiện trên: 409.',
    operationId: 'MedicalDetailsController_voidRecord',
  })
  @ApiCreatedResponse({ type: MedicalRecordResponseDto })
  voidRecord(
    @CurrentUser() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: VoidMedicalRecordDto,
  ): Promise<MedicalRecordResponseDto> {
    return this.visits.voidVisit(actor, id, body);
  }
}
