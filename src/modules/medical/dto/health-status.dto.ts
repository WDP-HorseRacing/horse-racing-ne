import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEnum, IsString, MaxLength, MinLength } from 'class-validator';
import { HorseHealthStatus } from '../../horses/enums/horse-status.enum';
import { trimValue } from './medical-visit.dto';

/**
 * Bác sĩ đổi trạng thái sức khỏe trực tiếp, bắt buộc lý do (F3.7 mục 1).
 */
export class UpdateHealthStatusDto {
  @ApiProperty({ enum: HorseHealthStatus })
  @IsEnum(HorseHealthStatus)
  healthStatus!: HorseHealthStatus;

  @ApiProperty({ minLength: 1, maxLength: 500 })
  @Transform(trimValue)
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  reason!: string;
}

/**
 * Kết quả đổi trạng thái sức khỏe; changed = false khi trạng thái mới trùng trạng thái cũ (F3.7 A3).
 */
export class HealthStatusChangeResponseDto {
  @ApiProperty({ format: 'uuid' })
  horseId!: string;

  @ApiProperty({ enum: HorseHealthStatus })
  from!: HorseHealthStatus;

  @ApiProperty({ enum: HorseHealthStatus })
  to!: HorseHealthStatus;

  @ApiProperty()
  changed!: boolean;
}

/**
 * Một lần đổi trạng thái sức khỏe trong lịch sử (F3.10 mục 6).
 */
export class HealthHistoryItemDto {
  @ApiProperty({ format: 'date-time' })
  changedAt!: Date;

  @ApiProperty({ enum: HorseHealthStatus, nullable: true })
  from!: HorseHealthStatus | null;

  @ApiProperty({ enum: HorseHealthStatus })
  to!: HorseHealthStatus;

  @ApiProperty({ type: String, nullable: true })
  reason!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Chức năng gây ra thay đổi, ví dụ F3.3, F3.6, F3.7, F1.8',
  })
  feature!: string | null;

  @ApiProperty({
    format: 'uuid',
    nullable: true,
    description: 'null khi hệ thống tự đổi',
  })
  actorId!: string | null;
}
