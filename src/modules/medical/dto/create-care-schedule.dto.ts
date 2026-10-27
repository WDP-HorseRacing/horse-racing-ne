import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { CareScheduleType } from '../constants/care-schedule.enum';
import { IsIsoInstant, trimValue } from '../../../common/utils/dto-input';

/**
 * Các loại lịch chăm sóc tạo tay, không gồm ngày hẹn khám định kỳ.
 */
export const CARE_TASK_TYPES = [
  CareScheduleType.VACCINATION,
  CareScheduleType.DEWORMING,
  CareScheduleType.FARRIER,
] as const;

/**
 * Loại lịch chăm sóc tạo tay.
 */
export type CareTaskType = (typeof CARE_TASK_TYPES)[number];

/**
 * Tạo lịch chăm sóc định kỳ: tiêm phòng, tẩy giun, kiểm tra móng.
 */
export class CreateCareScheduleDto {
  @ApiProperty({ enum: CARE_TASK_TYPES })
  @IsIn(CARE_TASK_TYPES)
  type!: CareTaskType;

  @ApiProperty({
    format: 'date-time',
    example: '2026-10-23T00:30:00+07:00',
    description: 'Ngày đến hạn, không ở quá khứ',
  })
  @IsIsoInstant()
  dueAt!: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Bác sĩ đang hoạt động được giao. Bỏ trống là chưa giao ai',
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
