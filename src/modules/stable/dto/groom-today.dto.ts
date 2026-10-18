import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';
import { CareScheduleType } from '../../medical/constants/care-schedule.enum';
import { SessionParticipantStatus } from '../../training/enums/session-participant-status.enum';
import { DailyChecklistResponseDto } from './daily-checklist.dto';
import { FeedingPlanResponseDto } from './feeding-plan.dto';

export class GroomTodayRunResponseDto {
  @Expose()
  @ApiProperty({ format: 'uuid', description: 'Lượt tập' })
  participantId!: string;

  @Expose()
  @ApiProperty({ format: 'uuid' })
  sessionId!: string;

  @Expose()
  @ApiProperty({ description: 'Tên buổi tập' })
  sessionName!: string;

  @Expose()
  @ApiProperty({ format: 'date-time' })
  scheduledStartAt!: Date;

  @Expose()
  @ApiProperty({ format: 'date-time' })
  scheduledEndAt!: Date;

  @Expose()
  @ApiProperty({ enum: SessionParticipantStatus })
  status!: SessionParticipantStatus;

  @Expose()
  @ApiPropertyOptional({
    nullable: true,
    type: String,
    description: 'Lý do dừng sớm, null nếu lượt không dừng sớm',
  })
  stoppedReason!: string | null;

  @Expose()
  @ApiPropertyOptional({
    nullable: true,
    type: String,
    description: 'Địa điểm của buổi tập',
  })
  location!: string | null;

  @Expose()
  @ApiPropertyOptional({
    nullable: true,
    type: String,
    description: 'Mặt sân của buổi tập',
  })
  surface!: string | null;
}

export class GroomTodayAssistedRunResponseDto extends GroomTodayRunResponseDto {
  @Expose()
  @ApiProperty({ format: 'uuid' })
  horseId!: string;

  @Expose()
  @ApiProperty()
  horseName!: string;
}

export class GroomTodayCareScheduleResponseDto {
  @Expose()
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @Expose()
  @ApiProperty({ enum: CareScheduleType })
  type!: CareScheduleType;

  @Expose()
  @ApiProperty({ format: 'date-time' })
  dueAt!: Date;

  @Expose()
  @ApiProperty({ description: 'Đến hạn trước hôm nay mà chưa làm' })
  overdue!: boolean;

  @Expose()
  @ApiPropertyOptional({ nullable: true, type: String })
  notes!: string | null;
}

export class GroomTodayOtherCareScheduleResponseDto extends GroomTodayCareScheduleResponseDto {
  @Expose()
  @ApiProperty({ format: 'uuid' })
  horseId!: string;

  @Expose()
  @ApiProperty()
  horseName!: string;
}

export class GroomTodayHorseResponseDto {
  @Expose()
  @ApiProperty({ format: 'uuid' })
  horseId!: string;

  @Expose()
  @ApiProperty()
  horseName!: string;

  @Expose()
  @ApiPropertyOptional({ nullable: true, type: String, description: 'Khu' })
  barnName!: string | null;

  @Expose()
  @ApiPropertyOptional({
    nullable: true,
    type: String,
    description: 'Ô chuồng',
  })
  stallCode!: string | null;

  @Expose()
  @Type(() => DailyChecklistResponseDto)
  @ApiPropertyOptional({
    type: DailyChecklistResponseDto,
    nullable: true,
    description: 'Checklist hôm nay; null nếu ngày không có việc nào',
  })
  checklist!: DailyChecklistResponseDto | null;

  @Expose()
  @Type(() => FeedingPlanResponseDto)
  @ApiPropertyOptional({
    type: FeedingPlanResponseDto,
    nullable: true,
    description: 'Khẩu phần đang áp dụng',
  })
  feedingPlan!: FeedingPlanResponseDto | null;

  @Expose()
  @Type(() => GroomTodayRunResponseDto)
  @ApiProperty({
    type: [GroomTodayRunResponseDto],
    description: 'Lượt tập hôm nay Groom được giao dắt, theo giờ bắt đầu',
  })
  trainingRuns!: GroomTodayRunResponseDto[];

  @Expose()
  @Type(() => GroomTodayCareScheduleResponseDto)
  @ApiProperty({
    type: [GroomTodayCareScheduleResponseDto],
    description:
      'Lịch chăm sóc Groom là người làm (giao Groom phụ trách, hoặc giao đích danh cho Groom), đến hạn tới hết hôm nay mà chưa làm',
  })
  careSchedules!: GroomTodayCareScheduleResponseDto[];
}

export class GroomTodayResponseDto {
  @Expose()
  @ApiProperty({ format: 'date', description: 'Hôm nay theo lịch CLB' })
  date!: string;

  @Expose()
  @Type(() => GroomTodayHorseResponseDto)
  @ApiProperty({
    type: [GroomTodayHorseResponseDto],
    description: 'Ngựa Groom đang phụ trách, theo tên',
  })
  horses!: GroomTodayHorseResponseDto[];

  @Expose()
  @Type(() => GroomTodayOtherCareScheduleResponseDto)
  @ApiProperty({
    type: [GroomTodayOtherCareScheduleResponseDto],
    description:
      'Lịch chăm sóc giao đích danh cho Groom ở ngựa Groom không phụ trách, đến hạn tới hết hôm nay mà chưa làm, ngày đến hạn sớm nhất lên trên',
  })
  otherCareSchedules!: GroomTodayOtherCareScheduleResponseDto[];

  @Expose()
  @Type(() => GroomTodayAssistedRunResponseDto)
  @ApiProperty({
    type: [GroomTodayAssistedRunResponseDto],
    description:
      'Lượt tập hôm nay Groom được giao dắt ở ngựa Groom không phụ trách, theo giờ bắt đầu',
  })
  assistedRuns!: GroomTodayAssistedRunResponseDto[];
}
