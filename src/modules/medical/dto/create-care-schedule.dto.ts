import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import {
  CareAssigneeType,
  CareScheduleType,
} from '../constants/care-schedule.enum';
import { trimValue } from '../../../common/utils/dto-input';

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
    description: 'Ngày đến hạn, không ở quá khứ',
  })
  @IsDateString()
  dueAt!: string;

  @ApiPropertyOptional({
    enum: CareAssigneeType,
    description:
      'Kiểu giao: GROOM (bỏ trống assignedTo là Groom đang phụ trách ngựa) hoặc VET. Bỏ trống là chưa giao ai',
  })
  @IsOptional()
  @IsEnum(CareAssigneeType)
  assigneeType?: CareAssigneeType;

  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'Người cụ thể: Groom đang hoạt động (assigneeType = GROOM) hoặc bác sĩ đang hoạt động (assigneeType = VET, bắt buộc)',
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
