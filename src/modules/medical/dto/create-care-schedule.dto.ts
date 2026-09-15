import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import { CareScheduleType } from '../constants/care-schedule.enum';

export class CreateCareScheduleDto {
  @ApiProperty({ enum: CareScheduleType })
  @IsEnum(CareScheduleType)
  type!: CareScheduleType;

  @ApiProperty({ format: 'date-time' })
  @IsDateString()
  dueAt!: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  assignedTo?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}
