import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
} from 'class-validator';

export class CreateCareScheduleDto {
  @ApiProperty({
    description: 'VACCINATION, DEWORMING, FARRIER or other care type',
  })
  @IsString()
  @MinLength(1)
  type!: string;

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
