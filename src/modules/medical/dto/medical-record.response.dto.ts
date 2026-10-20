import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { HorseHealthStatus } from '../../horses/enums/horse-status.enum';
import {
  MedicalVisitConclusion,
  MedicalVisitKind,
  VisitEditHealthOutcome,
  VisitVoidHealthOutcome,
} from '../constants/medical-visit.enum';
import { InjuryMarkerResponseDto } from './injury-marker.response.dto';
import { PrescriptionResponseDto } from './prescription.response.dto';

/**
 * Một buổi khám, kèm đơn thuốc và chấn thương. cost và costHidden không có key với Head Trainer.
 */
export class MedicalRecordResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  horseId!: string;

  @ApiProperty({ enum: MedicalVisitKind })
  kind!: MedicalVisitKind;

  @ApiProperty({
    format: 'uuid',
    nullable: true,
    description:
      'Bệnh án chứa buổi khám; null với buổi khám ngoài bệnh án kết luận NORMAL',
  })
  caseId!: string | null;

  @ApiProperty({ enum: MedicalVisitConclusion, nullable: true })
  conclusion!: MedicalVisitConclusion | null;

  @ApiProperty({ format: 'date-time' })
  examDate!: Date;

  @ApiProperty({ type: String, nullable: true })
  diagnosis!: string | null;

  @ApiProperty({ enum: HorseHealthStatus })
  resultingStatus!: HorseHealthStatus;

  @ApiProperty({ type: String, nullable: true })
  careInstructions!: string | null;

  @ApiProperty({ format: 'date-time', nullable: true })
  nextVisitAt!: Date | null;

  @ApiProperty({ format: 'uuid' })
  vetId!: string;

  @ApiPropertyOptional({ format: 'date-time', nullable: true })
  voidedAt!: Date | null;

  @ApiProperty({ type: String, nullable: true })
  voidReason!: string | null;

  @ApiProperty({ format: 'uuid', nullable: true })
  replacesRecordId!: string | null;

  @ApiProperty({
    type: Number,
    nullable: true,
    required: false,
    description:
      'Chi phí của buổi khám (VND); không có key với Head Trainer; null khi costHidden = true',
  })
  cost?: number | null;

  @ApiProperty({
    required: false,
    description:
      'true khi buổi khám thuộc giai đoạn sở hữu của chủ khác (chỉ xảy ra với Horse Owner), khi đó cost là null; không có key với Head Trainer',
  })
  costHidden?: boolean;

  @ApiProperty({ type: [PrescriptionResponseDto] })
  prescriptions!: PrescriptionResponseDto[];

  @ApiProperty({ type: [InjuryMarkerResponseDto] })
  injuries!: InjuryMarkerResponseDto[];
}

/**
 * Lần đổi trạng thái sức khỏe mới nhất xảy ra sau buổi khám.
 */
export class LaterHealthChangeResponseDto {
  @ApiProperty({ format: 'date-time' })
  changedAt!: Date;

  @ApiProperty({
    format: 'uuid',
    nullable: true,
    description: 'Người đổi; null khi hệ thống đổi',
  })
  changedBy!: string | null;

  @ApiProperty({ enum: HorseHealthStatus })
  to!: HorseHealthStatus;
}

/**
 * Buổi khám sau khi hủy, kèm cách trạng thái sức khỏe của ngựa được xử lý.
 */
export class VoidMedicalRecordResponseDto extends MedicalRecordResponseDto {
  @ApiProperty({
    enum: VisitVoidHealthOutcome,
    description:
      'REVERTED: sức khỏe ngựa về trạng thái ngay trước buổi khám. KEPT_LATER_CHANGE: đã có lần đổi sức khỏe sau buổi khám nên giữ nguyên. NOT_CHANGED_BY_VISIT: buổi khám không đổi sức khỏe. UNKNOWN_BEFORE: buổi khám cũ không lưu sức khỏe trước khám, giữ nguyên.',
  })
  healthOutcome!: VisitVoidHealthOutcome;

  @ApiProperty({
    type: LaterHealthChangeResponseDto,
    nullable: true,
    description:
      'Lần đổi sức khỏe mới nhất sau buổi khám; chỉ có khi healthOutcome là KEPT_LATER_CHANGE, có thể null nếu không đọc được từ nhật ký',
  })
  laterHealthChange!: LaterHealthChangeResponseDto | null;
}

/**
 * Buổi khám sau khi sửa, kèm cách trạng thái sức khỏe của ngựa được xử lý.
 */
export class EditMedicalRecordResponseDto extends MedicalRecordResponseDto {
  @ApiProperty({
    enum: VisitEditHealthOutcome,
    description:
      'UNCHANGED: lần sửa không đổi sức khỏe sau khám. UPDATED: buổi khám và sức khỏe hiện tại của ngựa cùng đổi. KEPT_LATER_CHANGE: đã có lần đổi sức khỏe sau buổi khám nên chỉ đổi resultingStatus của buổi khám, sức khỏe hiện tại giữ nguyên.',
  })
  healthOutcome!: VisitEditHealthOutcome;

  @ApiProperty({
    type: LaterHealthChangeResponseDto,
    nullable: true,
    description:
      'Lần đổi sức khỏe mới nhất sau buổi khám; chỉ có khi healthOutcome là KEPT_LATER_CHANGE, có thể null nếu không đọc được từ nhật ký',
  })
  laterHealthChange!: LaterHealthChangeResponseDto | null;
}
