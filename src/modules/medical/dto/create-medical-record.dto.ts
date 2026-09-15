import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { HorseHealthStatus } from '../../horses/constants/horse-status.enum';
import { MedicalSeverity } from '../constants/medical-record.enum';

export class CreateMedicalRecordDto {
  @ApiProperty({ format: 'date-time' })
  @IsDateString()
  examDate!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  diagnosis!: string;

  @ApiPropertyOptional({ enum: MedicalSeverity })
  @IsOptional()
  @IsEnum(MedicalSeverity)
  severity?: MedicalSeverity;

  @ApiPropertyOptional({ enum: HorseHealthStatus })
  @IsOptional()
  @IsEnum(HorseHealthStatus)
  resultingStatus?: HorseHealthStatus;
}
