import { ApiProperty } from '@nestjs/swagger';
import { Expose, Transform } from 'class-transformer';
import {
  IsInt,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { IsDateOnly, trimValue } from '../../../common/utils/dto-input';

const MAX_DAILY_FEE_VND = 1_000_000_000;

export class CreateDailyFeeDto {
  @ApiProperty({
    format: 'date',
    description: 'Ngày bắt đầu áp dụng (lịch câu lạc bộ), từ hôm nay trở đi',
  })
  @IsDateOnly({
    message: 'Ngày hiệu lực phải có dạng YYYY-MM-DD',
  })
  effectiveFrom!: string;

  @ApiProperty({
    minimum: 0,
    maximum: MAX_DAILY_FEE_VND,
    description: 'Phí nuôi một con ngựa trong một ngày (VND)',
  })
  @IsInt()
  @Min(0)
  @Max(MAX_DAILY_FEE_VND)
  dailyFee!: number;
}

export class UpdateDailyFeeDto {
  @ApiProperty({
    minimum: 0,
    maximum: MAX_DAILY_FEE_VND,
    description: 'Phí nuôi một con ngựa trong một ngày (VND) sau khi sửa',
  })
  @IsInt()
  @Min(0)
  @Max(MAX_DAILY_FEE_VND)
  dailyFee!: number;

  @ApiProperty({
    minLength: 1,
    maxLength: 500,
    description: 'Lý do sửa mức phí, bắt buộc',
  })
  @Transform(trimValue)
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  reason!: string;
}

export class DailyFeeResponseDto {
  @Expose()
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @Expose()
  @ApiProperty({ format: 'date' })
  effectiveFrom!: string;

  @Expose()
  @ApiProperty({ type: Number, description: 'VND mỗi con mỗi ngày' })
  dailyFee!: number;

  @Expose()
  @ApiProperty({ format: 'uuid' })
  createdBy!: string;

  @Expose()
  @ApiProperty({ format: 'date-time' })
  createdAt!: Date;
}
