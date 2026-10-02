import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsDateString,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { trimValue } from './medical-visit.dto';

/**
 * Dời ngày, đổi người được giao hoặc ghi chú của lịch chăm sóc.
 */
export class UpdateCareScheduleDto {
  @ApiPropertyOptional({
    format: 'date-time',
    description: 'Ngày đến hạn mới; dời ngày bắt buộc reason',
  })
  @IsOptional()
  @IsDateString()
  dueAt?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    nullable: true,
    description: 'Gửi null để bỏ người được giao',
  })
  @IsOptional()
  @IsUUID('4')
  assignedTo?: string | null;

  @ApiPropertyOptional({
    maxLength: 2000,
    nullable: true,
    description: 'Gửi null để xóa ghi chú',
  })
  @IsOptional()
  @Transform(trimValue)
  @IsString()
  @MaxLength(2000)
  notes?: string | null;

  @ApiPropertyOptional({ minLength: 1, maxLength: 500 })
  @IsOptional()
  @Transform(trimValue)
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  reason?: string;
}

/**
 * Hủy lịch chăm sóc, bắt buộc lý do.
 */
export class CancelCareScheduleDto {
  @ApiProperty({ minLength: 1, maxLength: 500 })
  @Transform(trimValue)
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  reason!: string;
}

/**
 * Hoàn tất lịch chăm sóc, tùy chọn hẹn luôn lần tới.
 */
export class CompleteCareScheduleDto {
  @ApiPropertyOptional({
    format: 'date-time',
    description:
      'Ngày đến hạn lần tới; có thì tạo lịch mới cùng loại. Chỉ Veterinarian được nhập',
  })
  @IsOptional()
  @IsDateString()
  nextDueAt?: string;
}
