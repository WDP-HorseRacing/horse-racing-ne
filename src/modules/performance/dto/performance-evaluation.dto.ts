import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose, Transform } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { trimValue } from '../../../common/utils/dto-input';

export class CreatePerformanceEvaluationDto {
  @ApiProperty({ minimum: 1, maximum: 10 })
  @IsInt()
  @Min(1)
  @Max(10)
  score!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  comment?: string;
}

export class UpdatePerformanceEvaluationDto {
  @ApiPropertyOptional({
    minimum: 1,
    maximum: 10,
    description: 'Điểm mới; bỏ trống để giữ nguyên',
  })
  @ValidateIf((_, value) => value !== undefined)
  @IsInt()
  @Min(1)
  @Max(10)
  score?: number;

  @ApiPropertyOptional({
    nullable: true,
    type: String,
    description: 'Nhận xét mới; gửi null để xóa, bỏ trống để giữ nguyên',
  })
  @IsOptional()
  @IsString()
  comment?: string | null;

  @ApiProperty({ minLength: 1, maxLength: 500, description: 'Lý do sửa' })
  @Transform(trimValue)
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  reason!: string;
}

export class PerformanceEvaluationResponseDto {
  @ApiProperty({ format: 'uuid' })
  @Expose()
  id!: string;

  @ApiProperty({ format: 'uuid' })
  @Expose()
  sessionParticipantId!: string;

  @ApiProperty({ format: 'uuid' })
  @Expose()
  evaluatorId!: string;

  @ApiProperty()
  @Expose()
  score!: number;

  @ApiPropertyOptional()
  @Expose()
  comment!: string | null;

  @ApiProperty({ format: 'date-time' })
  @Expose()
  createdAt!: Date;

  @ApiProperty({ format: 'date-time' })
  @Expose()
  updatedAt!: Date;
}
