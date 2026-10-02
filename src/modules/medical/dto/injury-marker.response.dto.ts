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

  @ApiProperty({ enum: InjuryBodyRegion })
  bodyRegion!: InjuryBodyRegion;

  @ApiPropertyOptional({ type: InjuryPositionDto, nullable: true })
  position!: InjuryPositionDto | null;

  @ApiProperty({ enum: InjuryType })
  injuryType!: InjuryType;

  @ApiProperty({ enum: RecoveryStatus })
  recoveryStatus!: RecoveryStatus;

  @ApiPropertyOptional({ nullable: true })
  notes!: string | null;
}

/**
 * Một dòng diễn biến chấn thương, kèm thời điểm khám và bệnh án của buổi khám.
 */
export class InjuryTimelineItemDto extends InjuryMarkerResponseDto {
  @ApiProperty({ format: 'date-time' })
  examDate!: Date;

  @ApiProperty({ format: 'uuid', nullable: true })
  caseId!: string | null;
}
