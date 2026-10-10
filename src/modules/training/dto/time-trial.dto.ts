import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose } from 'class-transformer';
import {
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateIf,
} from 'class-validator';

export class CreateTimeTrialDto {
  @ApiProperty({ minimum: 0.01 })
  @IsNumber()
  @Min(0.01)
  distanceM!: number;

  @ApiPropertyOptional({
    type: Number,
    minimum: 1,
    nullable: true,
    description: 'Thời gian mục tiêu (ms); null là không có mục tiêu',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  targetTimeMs?: number | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateTimeTrialDto {
  @ApiPropertyOptional({ minimum: 0.01, description: 'Cự ly chạy thử (mét)' })
  @IsOptional()
  @IsNumber()
  @Min(0.01)
  distanceM?: number;

  @ApiPropertyOptional({
    minimum: 1,
    nullable: true,
    description: 'Thời gian mục tiêu (ms); gửi null để xóa',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  targetTimeMs?: number | null;

  @ApiPropertyOptional({
    nullable: true,
    description: 'Gửi null để xóa ghi chú',
  })
  @IsOptional()
  @IsString()
  notes?: string | null;
}

export class TimeTrialResponseDto {
  @ApiProperty({ format: 'uuid' })
  @Expose()
  id!: string;

  @ApiProperty({ format: 'uuid' })
  @Expose()
  sessionId!: string;

  @ApiProperty()
  @Expose()
  distanceM!: string;

  @ApiPropertyOptional()
  @Expose()
  targetTimeMs!: string | null;

  @ApiPropertyOptional()
  @Expose()
  notes!: string | null;

  @ApiProperty({ format: 'date-time' })
  @Expose()
  createdAt!: Date;
}

export class CreateTrialResultDto {
  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  attemptNo!: number;

  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
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
  timeTrialId!: string;

  @ApiProperty({ format: 'uuid' })
  @Expose()
  sessionParticipantId!: string;

  @ApiProperty()
  @Expose()
  attemptNo!: number;

  @ApiProperty()
  @Expose()
  elapsedMs!: string;

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

export class UpdateTrialResultVideoDto {
  @ApiProperty({
    format: 'uuid',
    nullable: true,
    type: String,
    description:
      'Id video chạy thử đã tải lên với mục đích TRIAL_VIDEO bởi chính người sửa; gửi null để gỡ video',
  })
  @ValidateIf((_, value) => value !== null)
  @IsUUID()
  videoMediaId!: string | null;
}
