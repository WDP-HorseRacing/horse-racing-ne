import { ApiProperty } from '@nestjs/swagger';
import { Expose } from 'class-transformer';
import { IsInt, Max, Min } from 'class-validator';
import { IsDateOnly } from '../../../common/utils/dto-input';

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
