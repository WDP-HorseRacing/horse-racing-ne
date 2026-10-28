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
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Access, CurrentUser } from '../../../common/decorators';
import { UserRole } from '../../../common/enums/role.enum';
import type { Actor } from '../../../common/types/actor';
import {
  AdjustVisitCostDto,
  CareInstructionsResponseDto,
  CreateStandaloneVisitDto,
  EditMedicalRecordResponseDto,
  MedicalRecordResponseDto,
  UpdateMedicalVisitDto,
  VoidMedicalRecordDto,
  VoidMedicalRecordResponseDto,
} from '../dto';
import { MedicalRecordsService } from './medical-records.service';
import { MedicalVisitEditsService } from './medical-visit-edits.service';
import { MedicalVisitsService } from './medical-visits.service';
import { MEDICAL_READER_ROLES } from '../constants/medical.constants';

@ApiTags('medical')
@ApiBearerAuth()
@Controller()
export class MedicalRecordsController {
  constructor(
    private readonly medicalRecords: MedicalRecordsService,
    private readonly visits: MedicalVisitsService,
    private readonly visitEdits: MedicalVisitEditsService,
  ) {}

  @Access(MEDICAL_READER_ROLES)
  @Get('horses/:horseId/medical-records')
  @ApiOperation({
    summary: 'List horse medical visits',
    description:
      'Mọi buổi khám trong và ngoài bệnh án, kể cả buổi đã hủy, mới nhất lên trên. Head Trainer, Veterinarian, Club Manager: toàn câu lạc bộ. Horse Owner: chỉ ngựa đang sở hữu, đơn thuốc không có dosage và frequency, buổi khám thuộc giai đoạn chủ khác có cost null và costHidden true. Head Trainer không có key cost, costHidden. Groom không xem.',
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
    summary: 'Record a medical visit outside a case',
    description:
      'Khám định kỳ (ROUTINE) hoặc theo yêu cầu (REQUEST). Thời điểm khám là thời điểm ghi. cost tùy chọn, bỏ trống là 0. Kết luận ISSUE bắt buộc initialDiagnosis và mở bệnh án ngay. Ngựa đang có bệnh án mở: 409. Số đo bất thường chưa xác nhận: 422.',
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
      'Ghi chú chăm sóc và hạn chế vận động đang hiệu lực (của buổi khám gần nhất chưa hủy). Groom chỉ xem ngựa mình phụ trách (403 nếu không). current = null khi ngựa chưa được khám hoặc buổi gần nhất để trống ghi chú. Không trả chẩn đoán, thuốc hay chi phí.',
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
  @Patch('medical-records/:id')
  @ApiOperation({
    summary: 'Edit a medical visit with a reason',
    description:
      'Bắt buộc reason và ít nhất một ô khác (400). Chỉ bác sĩ ghi buổi khám (403), buổi đã hủy: 409, ngựa đã chuyển nhượng hoặc đã mất: 409. Ô không gửi giữ nguyên; null xóa diagnosis, careInstructions, nextVisitAt; danh sách gửi lên thay toàn bộ (prescriptions, requestIds); measurements sửa theo loại; injuries sửa theo injuryId. Không sửa ngựa, bác sĩ, thời điểm khám, chi phí. Sau khi gộp kiểm lại luật như lúc ghi. Bệnh án đã đóng: không đặt nextVisitAt (400), không gắn thêm yêu cầu (409), chấn thương bị sửa phải đã lành (409). NORMAL sang ISSUE mở bệnh án (409 nếu đang có bệnh án mở hoặc đã có buổi khám sau buổi này); ISSUE sang NORMAL hủy bệnh án (409 nếu bệnh án đã đóng hoặc còn buổi khác). Đổi healthStatus: chưa có lần đổi sức khỏe nào sau buổi khám thì đổi cả sức khỏe ngựa, ngược lại chỉ đổi resultingStatus, xem healthOutcome và laterHealthChange.',
  })
  @ApiOkResponse({ type: EditMedicalRecordResponseDto })
  editRecord(
    @CurrentUser() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateMedicalVisitDto,
  ): Promise<EditMedicalRecordResponseDto> {
    return this.visitEdits.editVisit(actor, id, body);
  }

  @Access([UserRole.VETERINARIAN])
  @Post('medical-records/:id/void')
  @ApiOperation({
    summary: 'Void a wrongly recorded medical visit',
    description:
      'Bắt buộc lý do. Chỉ bác sĩ ghi buổi khám mới được hủy, bác sĩ khác: 403. Số đo của buổi khám bị gỡ khỏi lịch sử số đo cơ thể. Buổi tái khám hủy được cả khi bệnh án đã đóng. Buổi mở bệnh án chỉ hủy được khi bệnh án còn Đang điều trị và không còn buổi nào khác chưa hủy; khi đó bệnh án chuyển Đã hủy. Hủy buổi đã hủy, hoặc buổi mở bệnh án không thỏa điều kiện trên: 409. Yêu cầu khám mà buổi khám đã đánh dấu EXAMINED về lại PENDING, bỏ gắn buổi khám. Buổi khám đã đổi sức khỏe mà chưa có lần đổi sức khỏe nào sau đó thì sức khỏe ngựa về trạng thái trước buổi khám; ngược lại giữ nguyên, xem healthOutcome và laterHealthChange.',
    operationId: 'MedicalDetailsController_voidRecord',
  })
  @ApiCreatedResponse({ type: VoidMedicalRecordResponseDto })
  voidRecord(
    @CurrentUser() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: VoidMedicalRecordDto,
  ): Promise<VoidMedicalRecordResponseDto> {
    return this.visits.voidVisit(actor, id, body);
  }

  @Access([UserRole.VETERINARIAN])
  @Patch('medical-records/:id/cost')
  @ApiOperation({
    summary: 'Adjust the cost of a medical visit with a reason',
    description:
      'Bắt buộc lý do, không giới hạn thời gian, bệnh án đang mở hay đã đóng đều được. Chỉ bác sĩ ghi buổi khám mới được điều chỉnh, bác sĩ khác: 403 (kiểm trước luật buổi đã hủy). Số mới trùng số cũ thì không ghi nhật ký và không gửi thông báo. Báo Club Manager và chủ của giai đoạn sở hữu chứa ngày khám. Ngựa đã chuyển nhượng hay đã mất vẫn sửa được. Buổi khám đã hủy: 409.',
  })
  @ApiOkResponse({ type: MedicalRecordResponseDto })
  adjustCost(
    @CurrentUser() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: AdjustVisitCostDto,
  ): Promise<MedicalRecordResponseDto> {
    return this.visits.adjustVisitCost(actor, id, body);
  }
}
