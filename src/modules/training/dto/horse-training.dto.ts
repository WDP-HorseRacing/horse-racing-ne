import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { PaginationMetaDto } from '../../../common/dto/pagination-response.dto';
import { HorseEnrollmentStatus } from '../enums/horse-enrollment-status.enum';
import { HorseTrainingSessionWhen } from '../enums/horse-training-session-when.enum';
import { SessionParticipantStatus } from '../enums/session-participant-status.enum';
import { TrainingClassStatus } from '../enums/training-class-status.enum';
import { TrainingSessionStatus } from '../enums/training-session-status.enum';
import { TrainingSessionType } from '../enums/training-session-type.enum';

export class HorseTrainingClassResponseDto {
  @ApiProperty({ format: 'uuid' })
  enrollmentId!: string;

  @ApiProperty({ format: 'uuid' })
  classId!: string;

  @ApiProperty()
  code!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ enum: TrainingClassStatus })
  classStatus!: TrainingClassStatus;

  @ApiPropertyOptional({
    nullable: true,
    type: String,
    description: 'Tên Head Trainer phụ trách lớp, null nếu lớp chưa có',
  })
  headTrainerName!: string | null;

  @ApiProperty({
    enum: HorseEnrollmentStatus,
    description: 'ACTIVE là lớp đang học; LEFT/CANCELLED là lớp đã rời',
  })
  enrollmentStatus!: HorseEnrollmentStatus;

  @ApiProperty({ format: 'date-time' })
  enrolledAt!: Date;

  @ApiPropertyOptional({ nullable: true, type: String, format: 'date-time' })
  leftAt!: Date | null;
}

export class HorseTrainingTrialResultDto {
  @ApiProperty()
  attemptNo!: number;

  @ApiProperty({ description: 'Thời gian chạy, mili giây (chuỗi số)' })
  elapsedMs!: string;

  @ApiPropertyOptional({
    nullable: true,
    type: String,
    description: 'Ghi chú của người bấm giờ cho lần chạy này',
  })
  notes!: string | null;

  @ApiProperty({ format: 'date-time' })
  recordedAt!: Date;
}

export class HorseTrainingSessionResponseDto {
  @ApiProperty({ format: 'uuid' })
  participantId!: string;

  @ApiProperty({ format: 'uuid' })
  sessionId!: string;

  @ApiProperty({ format: 'uuid' })
  classId!: string;

  @ApiProperty()
  className!: string;

  @ApiProperty()
  planName!: string;

  @ApiProperty({ description: 'Giai đoạn của giáo án' })
  phaseName!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ enum: TrainingSessionType })
  sessionType!: TrainingSessionType;

  @ApiProperty({ format: 'date-time' })
  scheduledStartAt!: Date;

  @ApiProperty({ format: 'date-time' })
  scheduledEndAt!: Date;

  @ApiPropertyOptional({ nullable: true, type: String })
  location!: string | null;

  @ApiPropertyOptional({ nullable: true, type: String })
  surface!: string | null;

  @ApiProperty({
    enum: TrainingSessionStatus,
    description: 'Trạng thái của cả buổi tập',
  })
  sessionStatus!: TrainingSessionStatus;

  @ApiProperty({
    enum: SessionParticipantStatus,
    description: 'Trạng thái của con ngựa trong buổi tập',
  })
  participantStatus!: SessionParticipantStatus;

  @ApiPropertyOptional({
    nullable: true,
    type: String,
    description: 'Tên Groom dắt ngựa buổi này, null nếu chưa giao',
  })
  groomName!: string | null;

  @ApiPropertyOptional({ nullable: true, type: String })
  absenceReason!: string | null;

  @ApiPropertyOptional({
    nullable: true,
    type: String,
    description: 'Lý do lượt tập của ngựa bị hủy (vd rời lớp, giải nghệ)',
  })
  cancelReason!: string | null;

  @ApiPropertyOptional({ nullable: true, type: String, format: 'date-time' })
  completedAt!: Date | null;

  @ApiProperty({
    type: [HorseTrainingTrialResultDto],
    description: 'Kết quả time trial của ngựa trong buổi, rỗng nếu không có',
  })
  trialResults!: HorseTrainingTrialResultDto[];
}

export class HorseTrainingSessionQueryDto {
  @ApiPropertyOptional({
    default: 1,
    minimum: 1,
    description: 'Trang hiện tại',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({
    default: 20,
    minimum: 1,
    maximum: 100,
    description: 'Số buổi mỗi trang',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 20;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Chỉ lấy buổi của một lớp',
  })
  @IsOptional()
  @IsUUID()
  classId?: string;

  @ApiPropertyOptional({
    enum: HorseTrainingSessionWhen,
    description:
      'upcoming: buổi chưa bắt đầu, gần nhất trước; history: buổi đã bắt đầu, mới nhất trước; bỏ trống: tất cả, mới nhất trước',
  })
  @IsOptional()
  @IsEnum(HorseTrainingSessionWhen)
  when?: HorseTrainingSessionWhen;
}

export class HorseTrainingSessionPageDto {
  @ApiProperty({ type: [HorseTrainingSessionResponseDto] })
  items!: HorseTrainingSessionResponseDto[];

  @ApiProperty({ type: PaginationMetaDto })
  meta!: PaginationMetaDto;
}
