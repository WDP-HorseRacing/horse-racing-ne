import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  InjuryBodyRegion,
  InjuryType,
  RecoveryStatus,
} from '../constants/injury-marker.enum';
import { InjuryPositionDto } from './create-injury.dto';

export class InjuryMarkerResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  medicalRecordId!: string;

  @ApiProperty({ format: 'uuid' })
  injuryId!: string;

  @ApiProperty({ enum: InjuryBodyRegion })
  bodyRegion!: InjuryBodyRegion;

  @ApiProperty({ type: InjuryPositionDto })
  position!: InjuryPositionDto;

  @ApiProperty({ enum: InjuryType })
  injuryType!: InjuryType;

  @ApiProperty({ enum: RecoveryStatus })
  recoveryStatus!: RecoveryStatus;

  @ApiPropertyOptional({ nullable: true })
  notes!: string | null;
}

/**
 * Một lần ghi nhận mức hồi phục của chấn thương, tại một buổi khám chưa hủy.
 */
export class InjuryHistoryItemDto {
  @ApiProperty({ format: 'uuid' })
  medicalRecordId!: string;

  @ApiProperty({ format: 'date-time' })
  examDate!: Date;

  @ApiProperty({ format: 'uuid', nullable: true, type: String })
  caseId!: string | null;

  @ApiProperty({ enum: RecoveryStatus })
  recoveryStatus!: RecoveryStatus;

  @ApiPropertyOptional({ nullable: true, type: String })
  notes!: string | null;
}

/**
 * Một chấn thương của ngựa, kèm mức hồi phục hiện tại và diễn biến qua các buổi khám chưa hủy.
 */
export class InjuryResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  horseId!: string;

  @ApiProperty({ enum: InjuryBodyRegion })
  bodyRegion!: InjuryBodyRegion;

  @ApiProperty({ enum: InjuryType })
  injuryType!: InjuryType;

  @ApiProperty({ type: InjuryPositionDto })
  position!: InjuryPositionDto;

  @ApiProperty({
    format: 'uuid',
    description: 'Buổi khám phát hiện chấn thương',
  })
  firstMedicalRecordId!: string;

  @ApiProperty({
    format: 'date-time',
    description: 'Thời điểm khám sớm nhất trong diễn biến',
  })
  firstExamDate!: Date;

  @ApiProperty({
    enum: RecoveryStatus,
    description: 'Mức hồi phục ở lần ghi nhận mới nhất',
  })
  currentRecoveryStatus!: RecoveryStatus;

  @ApiProperty({
    type: [InjuryHistoryItemDto],
    description: 'Các lần ghi nhận, theo thời điểm khám tăng dần',
  })
  history!: InjuryHistoryItemDto[];
}
