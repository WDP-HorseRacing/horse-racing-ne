import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { HorseHealthStatus } from '../../horses/constants/horse-status.enum';
import { MedicalSeverity } from '../constants/medical-record.enum';
import { PrescriptionResponseDto } from './prescription.response.dto';

export class MedicalRecordResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'date-time' })
  examDate!: Date;

  @ApiProperty()
  diagnosis!: string;

  @ApiProperty({ enum: MedicalSeverity })
  severity!: MedicalSeverity;

  @ApiProperty({ enum: HorseHealthStatus })
  resultingStatus!: HorseHealthStatus;

  @ApiProperty({ format: 'uuid' })
  vetId!: string;

  @ApiPropertyOptional({ format: 'date-time', nullable: true })
  voidedAt!: Date | null;

  @ApiProperty({ type: [PrescriptionResponseDto] })
  prescriptions!: PrescriptionResponseDto[];
}
