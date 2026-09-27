import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { CareScheduleType } from '../constants/care-schedule.enum';
import { trimValue } from './medical-visit.dto';

/**
 * Các loại lịch chăm sóc tạo tay ở F3.11; ngày hẹn khám định kỳ đặt ở F3.2.
 */
export const CARE_TASK_TYPES = [
  CareScheduleType.VACCINATION,
  CareScheduleType.DEWORMING,
  CareScheduleType.FARRIER,
] as const;

/**
 * Loại lịch chăm sóc tạo tay ở F3.11.
 */
export type CareTaskType = (typeof CARE_TASK_TYPES)[number];

/**
 * Tạo lịch chăm sóc định kỳ: tiêm phòng, tẩy giun, kiểm tra móng (F3.11 mục 1).
 */
export class CreateCareScheduleDto {
  @ApiProperty({ enum: CARE_TASK_TYPES })
  @IsIn(CARE_TASK_TYPES)
  type!: CareTaskType;

  @ApiProperty({
    format: 'date-time',
    description: 'Ngày đến hạn, không ở quá khứ',
  })
  @IsDateString()
  dueAt!: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Người được giao: Veterinarian hoặc Groom đang hoạt động',
  })
  @IsOptional()
  @IsUUID('4')
  assignedTo?: string;

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @Transform(trimValue)
  @IsString()
  @MaxLength(2000)
  notes?: string;
}
