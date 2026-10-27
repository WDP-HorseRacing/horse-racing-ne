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

export class GroomTodayVetAppointmentResponseDto {
  @Expose()
  @ApiProperty({ format: 'uuid', description: 'Ngày hẹn khám' })
  id!: string;

  @Expose()
  @ApiProperty({ format: 'uuid' })
  horseId!: string;

  @Expose()
  @ApiProperty()
  horseName!: string;

  @Expose()
  @ApiProperty({ enum: CareScheduleType })
  type!: CareScheduleType;

  @Expose()
  @ApiProperty({ format: 'date-time', description: 'Giờ hẹn' })
  scheduledAt!: Date;
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
  @Type(() => GroomTodayAssistedRunResponseDto)
  @ApiProperty({
    type: [GroomTodayAssistedRunResponseDto],
    description:
      'Lượt tập hôm nay Groom được giao dắt ở ngựa Groom không phụ trách, theo giờ bắt đầu',
  })
  assistedRuns!: GroomTodayAssistedRunResponseDto[];

  @Expose()
  @Type(() => GroomTodayVetAppointmentResponseDto)
  @ApiProperty({
    type: [GroomTodayVetAppointmentResponseDto],
    description:
      'Lịch hẹn bác sĩ hôm nay (khám định kỳ ROUTINE_CHECKUP, tái khám FOLLOW_UP) ở ngựa Groom đang phụ trách, chỉ để xem (Groom không hoàn tất), theo giờ hẹn',
  })
  horseVetAppointments!: GroomTodayVetAppointmentResponseDto[];
}
