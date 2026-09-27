import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, MaxLength, MinLength } from 'class-validator';
import { trimValue } from './medical-visit.dto';

/**
 * Bác sĩ gỡ khóa huấn luyện, bắt buộc lý do (F3.8 mục 6).
 */
export class ReleaseTrainingLockDto {
  @ApiProperty({ minLength: 1, maxLength: 1000, description: 'Lý do gỡ khóa' })
  @Transform(trimValue)
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  conclusion!: string;
}
