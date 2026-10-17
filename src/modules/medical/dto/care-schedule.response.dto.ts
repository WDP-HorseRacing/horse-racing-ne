import { ApiProperty } from '@nestjs/swagger';
import {
  CareAssigneeType,
  CareScheduleStatus,
  CareScheduleType,
} from '../constants/care-schedule.enum';

/**
 * Một lịch chăm sóc định kỳ.
 */
export class CareScheduleResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  horseId!: string;

  @ApiProperty({ enum: CareScheduleType })
  type!: CareScheduleType;

  @ApiProperty({ format: 'date-time' })
  dueAt!: Date;

  @ApiProperty({
    enum: CareAssigneeType,
    nullable: true,
    description: 'Kiểu giao, null là chưa giao ai',
  })
  assigneeType!: CareAssigneeType | null;

  @ApiProperty({
    format: 'uuid',
    nullable: true,
    description:
      'Người cụ thể; null kèm assigneeType = GROOM là Groom đang phụ trách ngựa',
  })
  assignedTo!: string | null;

  @ApiProperty({ enum: CareScheduleStatus })
  status!: CareScheduleStatus;

  @ApiProperty({ format: 'date-time', nullable: true })
  completedAt!: Date | null;

  @ApiProperty({ format: 'uuid', nullable: true })
  completedBy!: string | null;

  @ApiProperty({ type: String, nullable: true })
  cancelReason!: string | null;

  @ApiProperty({ type: String, nullable: true })
  notes!: string | null;
}

/**
 * Kết quả hoàn tất lịch chăm sóc: lịch vừa hoàn tất và lịch lần tới (nếu bác sĩ hẹn).
 */
export class CompleteCareScheduleResponseDto {
  @ApiProperty({ type: CareScheduleResponseDto })
  completed!: CareScheduleResponseDto;

  @ApiProperty({ type: CareScheduleResponseDto, nullable: true })
  next!: CareScheduleResponseDto | null;
}
