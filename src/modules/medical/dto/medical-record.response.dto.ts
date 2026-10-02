import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { HorseHealthStatus } from '../../horses/enums/horse-status.enum';
import {
  MedicalVisitConclusion,
  MedicalVisitKind,
} from '../constants/medical-visit.enum';
import { InjuryMarkerResponseDto } from './injury-marker.response.dto';
import { PrescriptionResponseDto } from './prescription.response.dto';

/**
 * Một buổi khám, kèm đơn thuốc và chấn thương.
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

  @ApiProperty({ type: [PrescriptionResponseDto] })
  prescriptions!: PrescriptionResponseDto[];

  @ApiProperty({ type: [InjuryMarkerResponseDto] })
  injuries!: InjuryMarkerResponseDto[];
}
