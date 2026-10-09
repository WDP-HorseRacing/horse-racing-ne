import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { DATE_ONLY_PATTERN, trimValue } from './medical-visit.dto';

/**
 * Một dòng đơn thuốc trong buổi khám: không trừ kho, không tính tiền.
 */
export class CreatePrescriptionDto {
  @ApiProperty({ maxLength: 160 })
  @Transform(trimValue)
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  medicine!: string;

  @ApiProperty({ maxLength: 160 })
  @Transform(trimValue)
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  dosage!: string;

  @ApiProperty({ maxLength: 160 })
  @Transform(trimValue)
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  frequency!: string;

  @ApiProperty({ format: 'date', description: 'YYYY-MM-DD' })
  @Matches(DATE_ONLY_PATTERN, {
    message: 'Ngày bắt đầu phải có dạng YYYY-MM-DD',
  })
  startDate!: string;

  @ApiPropertyOptional({
    format: 'date',
    description: 'YYYY-MM-DD, không sớm hơn startDate',
  })
  @IsOptional()
  @Matches(DATE_ONLY_PATTERN, {
    message: 'Ngày kết thúc phải có dạng YYYY-MM-DD',
  })
  endDate?: string;
}
