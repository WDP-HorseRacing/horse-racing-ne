import { ApiProperty } from '@nestjs/swagger';
import { Expose } from 'class-transformer';
import {
  IsInt,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { IsDateOnly } from '../../../common/utils/dto-input';

const MAX_DAILY_SURCHARGE_VND = 1_000_000_000;

export class CreateHorseSurchargeDto {
  @ApiProperty({
    maxLength: 500,
    description:
      'Nội dung chăm sóc riêng chủ ngựa yêu cầu, vd "Thức ăn loại 1, ngâm đá mỗi ngày"',
  })
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  description!: string;

  @ApiProperty({
    minimum: 1,
    maximum: MAX_DAILY_SURCHARGE_VND,
    description: 'Phụ phí một ngày (VND)',
  })
  @IsInt()
  @Min(1)
  @Max(MAX_DAILY_SURCHARGE_VND)
  dailyAmount!: number;

  @ApiProperty({
    format: 'date',
    description: 'Ngày bắt đầu tính (lịch câu lạc bộ), từ hôm nay trở đi',
  })
  @IsDateOnly({
    message: 'Ngày bắt đầu phải có dạng YYYY-MM-DD',
  })
  startDate!: string;

  @ApiProperty({
    format: 'date',
    description:
      'Ngày cuối tính phụ phí (lịch câu lạc bộ), không trước ngày bắt đầu',
  })
  @IsDateOnly({
    message: 'Ngày kết thúc phải có dạng YYYY-MM-DD',
  })
  endDate!: string;
}

export class HorseSurchargeResponseDto {
  @Expose()
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @Expose()
  @ApiProperty({ format: 'uuid' })
  horseId!: string;

  @Expose()
  @ApiProperty()
  description!: string;

  @Expose()
  @ApiProperty({ type: Number, description: 'VND mỗi ngày' })
  dailyAmount!: number;

  @Expose()
  @ApiProperty({ format: 'date' })
  startDate!: string;

  @Expose()
  @ApiProperty({ format: 'date' })
  endDate!: string;

  @Expose()
  @ApiProperty({ format: 'uuid' })
  createdBy!: string;

  @Expose()
  @ApiProperty({ format: 'date-time' })
  createdAt!: Date;

  @Expose()
  @ApiProperty({
    format: 'uuid',
    nullable: true,
    type: String,
    description: 'Head Trainer đã xác nhận áp dụng; null là chưa áp dụng',
  })
  appliedBy!: string | null;

  @Expose()
  @ApiProperty({
    nullable: true,
    type: String,
    description: 'Tên Head Trainer đã xác nhận; null là chưa áp dụng',
  })
  appliedByName!: string | null;

  @Expose()
  @ApiProperty({
    format: 'date-time',
    nullable: true,
    type: String,
    description: 'Lúc xác nhận áp dụng; null là chưa áp dụng',
  })
  appliedAt!: Date | null;
}

export class UnappliedSurchargeResponseDto extends HorseSurchargeResponseDto {
  @Expose()
  @ApiProperty()
  horseName!: string;

  @Expose()
  @ApiProperty({
    nullable: true,
    type: String,
    description: 'Khu hiện tại của ngựa; null là ngựa chưa xếp khu',
  })
  barnName!: string | null;

  @Expose()
  @ApiProperty({
    nullable: true,
    type: String,
    description:
      'Head Trainer đang phụ trách khu của ngựa; null là chưa có Head Trainer phụ trách',
  })
  headTrainerName!: string | null;
}
