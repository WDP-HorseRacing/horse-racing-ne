import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import { RecoveryStatus } from '../constants/injury-marker.enum';

export class RecordRecoveryDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  medicalRecordId!: string;

  @ApiProperty({ enum: RecoveryStatus })
  @IsEnum(RecoveryStatus)
  status!: RecoveryStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}
