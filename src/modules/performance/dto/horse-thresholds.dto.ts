import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';
import {
  IsDateString,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { ThresholdSource } from '../enums/threshold-source.enum';

export class ThresholdLimitsDto {
  @ApiProperty({
    minimum: 1,
    maximum: 300,
    description: 'Nhịp tim vượt mức này là WARNING',
  })
  @Expose()
  @IsInt()
  @Min(1)
  @Max(300)
  heartRateWarningBpm!: number;

  @ApiProperty({
    minimum: 1,
    maximum: 300,
    description: 'Nhịp tim vượt mức này là CRITICAL',
  })
  @Expose()
  @IsInt()
  @Min(1)
  @Max(300)
  heartRateCriticalBpm!: number;

  @ApiProperty({
    minimum: 1,
    maximum: 30,
    description: 'Tốc độ (m/s) vượt mức này là WARNING',
  })
  @Expose()
  @IsNumber()
  @Min(1)
  @Max(30)
  maxSpeedMps!: number;
}

export class UpsertThresholdDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  profileName!: string;

  @ApiProperty({ format: 'date-time' })
  @IsDateString()
  effectiveFrom!: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsDateString()
  effectiveTo?: string;

  @ApiProperty({ type: ThresholdLimitsDto })
  @ValidateNested()
  @Type(() => ThresholdLimitsDto)
  limits!: ThresholdLimitsDto;
}

export class ThresholdProfileResponseDto {
  @ApiProperty({ format: 'uuid' })
  @Expose()
  id!: string;

  @ApiProperty({ format: 'uuid' })
  @Expose()
  horseId!: string;

  @ApiProperty()
  @Expose()
  profileName!: string;

  @ApiProperty({ description: 'Phiên bản, tăng dần theo từng con ngựa' })
  @Expose()
  ruleVersion!: number;

  @ApiProperty({ format: 'date-time' })
  @Expose()
  effectiveFrom!: Date;

  @ApiPropertyOptional({ format: 'date-time', nullable: true })
  @Expose()
  effectiveTo!: Date | null;

  @ApiProperty({ type: ThresholdLimitsDto })
  @Expose()
  @Type(() => ThresholdLimitsDto)
  limits!: ThresholdLimitsDto;
}

export class HorseThresholdsResponseDto {
  @ApiProperty({
    enum: ThresholdSource,
    description: 'Ngưỡng đang áp lấy từ bộ riêng của ngựa hay mặc định CLB',
  })
  source!: ThresholdSource;

  @ApiProperty({
    type: ThresholdLimitsDto,
    description: 'Ngưỡng đang áp tại thời điểm gọi',
  })
  activeLimits!: ThresholdLimitsDto;

  @ApiProperty({
    type: [ThresholdProfileResponseDto],
    description: 'Mọi phiên bản ngưỡng riêng của ngựa, mới nhất đứng đầu',
  })
  profiles!: ThresholdProfileResponseDto[];
}
