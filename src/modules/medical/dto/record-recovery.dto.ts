import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';

export enum RecoveryStatus {
  ACUTE = 'ACUTE',
  RECOVERING = 'RECOVERING',
  HEALED = 'HEALED',
}

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
