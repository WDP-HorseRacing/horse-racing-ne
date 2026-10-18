import { ApiProperty } from '@nestjs/swagger';
import { HorseLifecyclePreviewResponseDto } from '../../horses/dto';
import { HorseHealthStatus } from '../../horses/enums/horse-status.enum';
import { MedicalCaseStatus } from '../constants/medical-case.enum';
import { MedicalRecordResponseDto } from './medical-record.response.dto';

/**
 * Một bệnh án. totalCost không có key với Head Trainer.
 */
export class MedicalCaseResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  horseId!: string;

  @ApiProperty({ enum: MedicalCaseStatus })
  status!: MedicalCaseStatus;

  @ApiProperty({ format: 'date-time' })
  openedAt!: Date;

  @ApiProperty({ format: 'uuid' })
  openedBy!: string;

  @ApiProperty()
  initialDiagnosis!: string;

  @ApiProperty({ format: 'date-time', nullable: true })
  closedAt!: Date | null;

  @ApiProperty({ type: String, nullable: true })
  finalConclusion!: string | null;

  @ApiProperty({
    type: Number,
    required: false,
    description:
      'Tổng chi phí các buổi khám chưa hủy của bệnh án (VND); với Horse Owner chỉ cộng buổi khám thuộc giai đoạn mình sở hữu; không có key với Head Trainer',
  })
  totalCost?: number;
}

/**
 * Danh sách bệnh án của một con ngựa và tổng chi phí y tế của ngựa.
 */
export class MedicalCaseListResponseDto {
  @ApiProperty({ type: [MedicalCaseResponseDto] })
  items!: MedicalCaseResponseDto[];

  @ApiProperty({
    type: Number,
    required: false,
    description:
      'Tổng chi phí mọi buổi khám chưa hủy của ngựa, trong và ngoài bệnh án (VND); với Horse Owner chỉ cộng buổi khám thuộc giai đoạn mình sở hữu; không có key với Head Trainer',
  })
  totalCost?: number;
}

/**
 * Bệnh án kèm toàn bộ buổi khám, mới nhất lên trên.
 */
export class MedicalCaseDetailResponseDto extends MedicalCaseResponseDto {
  @ApiProperty({ type: [MedicalRecordResponseDto] })
  visits!: MedicalRecordResponseDto[];
}

/**
 * Lệnh khóa huấn luyện đang hiệu lực gắn với bệnh án, hiện ở bảng đóng bệnh án.
 */
export class CaseActiveLockDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  reason!: string;

  @ApiProperty({ format: 'date-time', nullable: true })
  lockEnd!: Date | null;
}

/**
 * Những gì bác sĩ cần xem trước khi đóng bệnh án.
 */
export class MedicalCaseClosePreviewResponseDto {
  @ApiProperty({ type: CaseActiveLockDto, nullable: true })
  activeLock!: CaseActiveLockDto | null;

  @ApiProperty({ enum: HorseHealthStatus })
  healthStatus!: HorseHealthStatus;

  @ApiProperty({
    description: 'True khi ngựa vẫn Chấn thương hoặc Cách ly',
  })
  healthWarning!: boolean;

  @ApiProperty({ description: 'Số yêu cầu khám còn đang chờ của con ngựa' })
  pendingRequestCount!: number;

  @ApiProperty({
    type: HorseLifecyclePreviewResponseDto,
    description:
      'Hệ quả nếu đóng bệnh án kèm ngày mất, cùng dạng với xem trước đổi vòng đời sang DECEASED',
  })
  deathImpact!: HorseLifecyclePreviewResponseDto;
}

/**
 * Một dòng của báo cáo chi phí: tổng chi phí của một con ngựa.
 */
export class MedicalCostReportRowDto {
  @ApiProperty({ format: 'uuid' })
  horseId!: string;

  @ApiProperty()
  horseName!: string;

  @ApiProperty({ description: 'Số buổi khám chưa hủy trong khoảng ngày' })
  visitCount!: number;

  @ApiProperty()
  totalCost!: number;
}

/**
 * Báo cáo tổng chi phí y tế theo khoảng ngày khám.
 */
export class MedicalCostReportResponseDto {
  @ApiProperty({ format: 'date' })
  from!: string;

  @ApiProperty({ format: 'date' })
  to!: string;

  @ApiProperty({ description: 'Số buổi khám chưa hủy trong khoảng ngày' })
  visitCount!: number;

  @ApiProperty()
  totalCost!: number;

  @ApiProperty({ type: [MedicalCostReportRowDto] })
  items!: MedicalCostReportRowDto[];
}
