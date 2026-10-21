import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsEnum,
  IsInt,
  IsOptional,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { PaginationMetaDto } from '../../../common/dto/pagination-response.dto';
import { toQueryArray } from '../../../common/utils/query-array';
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

  @ApiProperty({ type: Number, description: 'Thời gian chạy, mili giây' })
  elapsedMs!: number;

  @ApiPropertyOptional({
    nullable: true,
    type: String,
    description: 'Ghi chú của người bấm giờ cho lần chạy này',
  })
  notes!: string | null;

  @ApiPropertyOptional({
    nullable: true,
    type: String,
    description: 'Link xem video chạy thử có hạn dùng, null nếu không có video',
  })
  videoUrl!: string | null;

  @ApiProperty({ format: 'date-time' })
  recordedAt!: Date;
}

export class HorseTrainingEvaluationDto {
  @ApiProperty({ description: 'Điểm đánh giá' })
  score!: number;

  @ApiPropertyOptional({ nullable: true, type: String })
  comment!: string | null;

  @ApiPropertyOptional({
    nullable: true,
    type: String,
    description: 'Tên người đánh giá',
  })
  evaluatorName!: string | null;

  @ApiProperty({ format: 'date-time' })
  createdAt!: Date;
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

  @ApiPropertyOptional({
    nullable: true,
    description: 'Môn học của buổi, null nếu buổi không gắn môn',
  })
  subjectName!: string | null;

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
    description: 'Lý do dừng sớm, null nếu lượt không dừng sớm',
  })
  stoppedReason!: string | null;

  @ApiPropertyOptional({
    nullable: true,
    type: String,
    description: 'Lý do lượt tập của ngựa bị hủy',
  })
  cancelReason!: string | null;

  @ApiPropertyOptional({
    nullable: true,
    type: String,
    format: 'date-time',
    description: 'Giờ kết thúc lượt, gồm hoàn thành hoặc dừng sớm',
  })
  completedAt!: Date | null;

  @ApiProperty({
    type: [HorseTrainingTrialResultDto],
    description: 'Kết quả time trial của ngựa trong buổi, rỗng nếu không có',
  })
  trialResults!: HorseTrainingTrialResultDto[];

  @ApiPropertyOptional({
    type: HorseTrainingEvaluationDto,
    nullable: true,
    description: 'Đánh giá sau buổi tập, null nếu chưa có',
  })
  evaluation!: HorseTrainingEvaluationDto | null;
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
      'upcoming: lượt còn mở, cùng lượt hủy do khóa tập hoặc không đủ điều kiện của buổi chưa bắt đầu, gần nhất trước; history: buổi đã bắt đầu, mới nhất trước; bỏ trống: tất cả (kể cả lượt đã hủy), mới nhất trước',
  })
  @IsOptional()
  @IsEnum(HorseTrainingSessionWhen)
  when?: HorseTrainingSessionWhen;

  @ApiPropertyOptional({
    enum: SessionParticipantStatus,
    isArray: true,
    description:
      'Chỉ lấy lượt có trạng thái thuộc danh sách; nhiều giá trị thì lặp tham số (`status=CANCELLED&status=CANCELLED_BY_LOCK`); kết hợp với `when` và `classId`',
  })
  @IsOptional()
  @Transform(toQueryArray)
  @ArrayMinSize(1)
  @IsEnum(SessionParticipantStatus, { each: true })
  status?: SessionParticipantStatus[];
}

export class HorseTrainingSessionPageDto {
  @ApiProperty({ type: [HorseTrainingSessionResponseDto] })
  items!: HorseTrainingSessionResponseDto[];

  @ApiProperty({ type: PaginationMetaDto })
  meta!: PaginationMetaDto;
}
