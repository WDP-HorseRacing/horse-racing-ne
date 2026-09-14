import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateMedicalRecordDto {
  @ApiProperty({ format: 'date-time' })
  @IsDateString()
  examDate!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  diagnosis!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  severity?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  resultingStatus?: string;
}
