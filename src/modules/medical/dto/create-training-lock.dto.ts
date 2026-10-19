import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { IsIsoInstant, trimValue } from '../../../common/utils/dto-input';

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
    example: '2026-10-23T00:30:00+07:00',
    description: 'Ngày dự kiến gỡ, chỉ để tham khảo; không ở quá khứ',
  })
  @IsOptional()
  @IsIsoInstant()
  lockEnd?: string;
}
