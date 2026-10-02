import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsDateString,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { trimValue } from './medical-visit.dto';

/**
 * Bác sĩ đặt khóa huấn luyện. Thời điểm bắt đầu là lúc đặt.
 */
export class CreateTrainingLockDto {
  @ApiProperty({ minLength: 1, maxLength: 1000 })
  @Transform(trimValue)
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  reason!: string;

  @ApiPropertyOptional({
    format: 'date-time',
    description: 'Ngày dự kiến gỡ, chỉ để tham khảo; không ở quá khứ',
  })
  @IsOptional()
  @IsDateString()
  lockEnd?: string;
}
