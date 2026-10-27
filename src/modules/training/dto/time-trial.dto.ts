import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose, Transform } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { trimValue } from '../../../common/utils/dto-input';
import { INT_COLUMN_MAX } from '../constants/column-limits.constants';
import {
  MAX_TRIAL_TIME_MESSAGE,
  MAX_TRIAL_TIME_MS,
} from '../constants/trial-time.constants';

export class CreateTrialResultDto {
  @ApiProperty({ minimum: 1, maximum: INT_COLUMN_MAX })
  @IsInt()
  @Min(1)
  @Max(INT_COLUMN_MAX)
  attemptNo!: number;

  @ApiProperty({ minimum: 1, maximum: MAX_TRIAL_TIME_MS })
  @IsInt()
  @Min(1)
  @Max(MAX_TRIAL_TIME_MS, { message: MAX_TRIAL_TIME_MESSAGE })
  elapsedMs!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'Id video chạy thử đã tải lên với mục đích TRIAL_VIDEO bởi chính người ghi',
  })
  @IsOptional()
  @IsUUID()
  videoMediaId?: string;
}

export class TrialResultResponseDto {
  @ApiProperty({ format: 'uuid' })
  @Expose()
  id!: string;

  @ApiProperty({ format: 'uuid' })
  @Expose()
  sessionParticipantId!: string;

  @ApiProperty()
  @Expose()
  attemptNo!: number;

  @ApiProperty({ type: Number, description: 'Thời gian chạy (ms)' })
  @Expose()
  elapsedMs!: number;

  @ApiPropertyOptional()
  @Expose()
  notes!: string | null;

  @ApiPropertyOptional({ format: 'uuid' })
  @Expose()
  videoMediaId!: string | null;

  @ApiPropertyOptional({
    nullable: true,
    type: String,
    description: 'Link xem video có hạn dùng, null nếu lần chạy không có video',
  })
  videoUrl!: string | null;

  @ApiProperty({ format: 'uuid' })
  @Expose()
  recordedBy!: string;

  @ApiProperty({ format: 'date-time' })
  @Expose()
  recordedAt!: Date;
}

export class UpdateTrialResultDto {
  @ApiPropertyOptional({
    format: 'uuid',
    nullable: true,
    type: String,
    description:
      'Id video chạy thử đã tải lên với mục đích TRIAL_VIDEO bởi chính người sửa; gửi null để gỡ video, bỏ trống để giữ nguyên',
  })
  @IsOptional()
  @IsUUID()
  videoMediaId?: string | null;

  @ApiPropertyOptional({
    minimum: 1,
    maximum: MAX_TRIAL_TIME_MS,
    description: 'Thời gian chạy mới (ms); bỏ trống để giữ nguyên',
  })
  @ValidateIf((_, value) => value !== undefined)
  @IsInt()
  @Min(1)
  @Max(MAX_TRIAL_TIME_MS, { message: MAX_TRIAL_TIME_MESSAGE })
  elapsedMs?: number;

  @ApiPropertyOptional({
    nullable: true,
    type: String,
    description: 'Ghi chú mới; gửi null để xóa, bỏ trống để giữ nguyên',
  })
  @IsOptional()
  @IsString()
  notes?: string | null;

  @ApiPropertyOptional({
    minLength: 1,
    maxLength: 500,
    description: 'Lý do sửa; bắt buộc khi gửi elapsedMs hoặc notes',
  })
  @ValidateIf(
    (body: UpdateTrialResultDto) =>
      body.elapsedMs !== undefined || body.notes !== undefined,
  )
  @Transform(trimValue)
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  reason?: string;
}
