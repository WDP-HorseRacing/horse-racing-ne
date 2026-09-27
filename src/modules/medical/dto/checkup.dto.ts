import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { HorseHealthStatus } from '../../horses/enums/horse-status.enum';
import { CheckupDueStatus } from '../constants/checkup.enum';
import { trimValue } from './medical-visit.dto';

/**
 * Lọc lịch khám định kỳ (F3.2).
 */
export class CheckupListQueryDto {
  @ApiPropertyOptional({ enum: CheckupDueStatus })
  @IsOptional()
  @IsEnum(CheckupDueStatus)
  status?: CheckupDueStatus;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4')
  barnId?: string;
}

/**
 * Đặt hoặc dời ngày hẹn khám định kỳ (F3.2 mục 3, 5).
 */
export class SetCheckupAppointmentDto {
  @ApiProperty({
    format: 'date-time',
    description:
      'Ngày giờ hẹn; không ở quá khứ, không muộn hơn hạn khám khi ngựa chưa quá hạn',
  })
  @IsDateString()
  scheduledAt!: string;

  @ApiPropertyOptional({
    maxLength: 500,
    description: 'Bắt buộc khi dời ngày hẹn đã đặt',
  })
  @IsOptional()
  @Transform(trimValue)
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  reason?: string;
}

/**
 * Ngày hẹn khám định kỳ đang hiệu lực.
 */
export class CheckupAppointmentDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  horseId!: string;

  @ApiProperty({ format: 'date-time' })
  scheduledAt!: Date;
}

/**
 * Hạn khám định kỳ của một con ngựa (F3.2 mục 2).
 */
export class CheckupItemDto {
  @ApiProperty({ format: 'uuid' })
  horseId!: string;

  @ApiProperty()
  horseName!: string;

  @ApiProperty({ format: 'uuid', nullable: true })
  barnId!: string | null;

  @ApiProperty({ enum: HorseHealthStatus })
  healthStatus!: HorseHealthStatus;

  @ApiProperty({ format: 'date', nullable: true })
  lastVisitDate!: string | null;

  @ApiProperty({ format: 'date' })
  dueDate!: string;

  @ApiProperty({ description: 'Số ngày còn lại tới hạn; âm là đã quá hạn' })
  daysLeft!: number;

  @ApiProperty({ enum: CheckupDueStatus })
  dueStatus!: CheckupDueStatus;

  @ApiProperty({ type: CheckupAppointmentDto, nullable: true })
  appointment!: CheckupAppointmentDto | null;
}
