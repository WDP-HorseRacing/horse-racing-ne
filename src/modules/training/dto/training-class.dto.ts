import {
  ApiProperty,
  ApiPropertyOptional,
  OmitType,
  PartialType,
} from '@nestjs/swagger';
import { Expose } from 'class-transformer';
import {
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { RaceAptitude } from '../../horses/enums/race-aptitude.enum';
import { TrainingClassStatus } from '../enums/training-class-status.enum';
import { TrainingPlanSubjectResponseDto } from './training-plan.dto';
import { IsDateOnly } from '../../../common/utils/dto-input';

export class CreateTrainingClassDto {
  @ApiProperty({
    maxLength: 32,
    description: 'Mã lớp huấn luyện (ví dụ: TC-2026-01)',
  })
  @IsString()
  @MinLength(1)
  @MaxLength(32, { message: 'Mã lớp tối đa 32 ký tự' })
  code!: string;

  @ApiProperty({ maxLength: 160, description: 'Tên lớp huấn luyện' })
  @IsString()
  @MinLength(1)
  @MaxLength(160, { message: 'Tên lớp tối đa 160 ký tự' })
  name!: string;

  @ApiPropertyOptional({ description: 'Mô tả lớp học' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({
    enum: RaceAptitude,
    description: 'Sở trường cự ly mục tiêu (SPRINTER, MILER, STAYER)',
  })
  @IsOptional()
  @IsEnum(RaceAptitude)
  raceAptitude?: RaceAptitude;

  @ApiPropertyOptional({
    default: 10,
    minimum: 1,
    description: 'Sức chứa tối đa số ngựa trong lớp',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  maxHorses?: number;

  @ApiProperty({
    format: 'uuid',
    description: 'Giáo án của Head Trainer phụ trách lớp',
  })
  @IsUUID()
  planId!: string;

  @ApiProperty({
    format: 'date',
    description:
      'Ngày bắt đầu, từ hôm nay trở đi theo lịch CLB (khi sửa lớp chỉ kiểm nếu khác ngày bắt đầu đang có), không thì 400 ở ô startDate; ngày kết thúc tự tính theo tổng số tuần của giáo án',
  })
  @IsDateOnly()
  startDate!: string;
}

export class UpdateTrainingClassDto extends PartialType(
  OmitType(CreateTrainingClassDto, ['planId'] as const),
) {}

export class UpdateTrainingClassStatusDto {
  @ApiProperty({
    enum: [TrainingClassStatus.COMPLETED, TrainingClassStatus.CANCELLED],
  })
  @IsIn([TrainingClassStatus.COMPLETED, TrainingClassStatus.CANCELLED])
  status!: TrainingClassStatus.COMPLETED | TrainingClassStatus.CANCELLED;

  @ApiPropertyOptional({
    minLength: 1,
    description: 'Lý do hủy class, bắt buộc khi status = CANCELLED',
  })
  @ValidateIf(
    (body: UpdateTrainingClassStatusDto) =>
      body.status === TrainingClassStatus.CANCELLED,
  )
  @IsString()
  @MinLength(1)
  cancelReason?: string;
}

export class TrainingClassResponseDto {
  @ApiProperty({ format: 'uuid' })
  @Expose()
  id!: string;

  @ApiProperty()
  @Expose()
  code!: string;

  @ApiProperty()
  @Expose()
  name!: string;

  @ApiPropertyOptional()
  @Expose()
  description!: string | null;

  @ApiPropertyOptional({ enum: RaceAptitude })
  @Expose()
  raceAptitude!: RaceAptitude | null;

  @ApiProperty()
  @Expose()
  maxHorses!: number;

  @ApiPropertyOptional({ format: 'uuid' })
  @Expose()
  headTrainerId!: string | null;

  @ApiProperty({ format: 'uuid' })
  @Expose()
  planId!: string;

  @ApiProperty({ format: 'date' })
  @Expose()
  startDate!: string;

  @ApiProperty({ format: 'date' })
  @Expose()
  endDate!: string;

  @ApiProperty({ enum: TrainingClassStatus })
  @Expose()
  status!: TrainingClassStatus;

  @ApiPropertyOptional({ format: 'date-time' })
  @Expose()
  completedAt!: Date | null;

  @ApiPropertyOptional({ format: 'date-time' })
  @Expose()
  cancelledAt!: Date | null;

  @ApiPropertyOptional()
  @Expose()
  cancelReason!: string | null;

  @ApiProperty({ format: 'date-time' })
  @Expose()
  createdAt!: Date;

  @ApiProperty({ format: 'date-time' })
  @Expose()
  updatedAt!: Date;
}

export class TrainingClassPhaseResponseDto {
  @ApiProperty({ description: 'Thứ tự giai đoạn, bắt đầu từ 1' })
  position!: number;

  @ApiProperty({ description: 'Số tuần của giai đoạn' })
  weeks!: number;

  @ApiProperty({ format: 'date', description: 'Ngày đầu của giai đoạn' })
  startDate!: string;

  @ApiProperty({ format: 'date', description: 'Ngày cuối của giai đoạn' })
  endDate!: string;

  @ApiProperty({ description: 'Thời lượng tối thiểu của giai đoạn (phút)' })
  minTotalMinutes!: number;

  @ApiProperty({
    type: [TrainingPlanSubjectResponseDto],
    description: 'Các môn của giai đoạn, sắp theo tên môn',
  })
  subjects!: TrainingPlanSubjectResponseDto[];
}

export class TrainingClassPlanResponseDto {
  @ApiProperty({ format: 'uuid' })
  classId!: string;

  @ApiProperty({ format: 'uuid', description: 'Giáo án gốc đã chép' })
  planId!: string;

  @ApiProperty({ description: 'Thời lượng tối thiểu của cả lớp (phút)' })
  minTotalMinutes!: number;

  @ApiProperty({ type: [TrainingClassPhaseResponseDto] })
  phases!: TrainingClassPhaseResponseDto[];
}

export class ClassWeekSubjectProgressDto {
  @ApiProperty({ format: 'uuid' })
  subjectId!: string;

  @ApiProperty()
  subjectName!: string;

  @ApiProperty({ description: 'Số buổi tối thiểu trong tuần' })
  minSessions!: number;

  @ApiProperty({ description: 'Số buổi chưa hủy đã xếp trong tuần' })
  scheduledSessions!: number;
}

export class ClassWeekProgressDto {
  @ApiProperty({ description: 'Tuần thứ mấy của lớp, bắt đầu từ 1' })
  week!: number;

  @ApiProperty({ description: 'Giai đoạn chứa tuần này' })
  phasePosition!: number;

  @ApiProperty({ format: 'date' })
  startDate!: string;

  @ApiProperty({ format: 'date' })
  endDate!: string;

  @ApiProperty({ type: [ClassWeekSubjectProgressDto] })
  subjects!: ClassWeekSubjectProgressDto[];
}

export class TrainingClassProgressResponseDto {
  @ApiProperty({ format: 'uuid' })
  classId!: string;

  @ApiProperty({ description: 'Thời lượng tối thiểu của cả lớp (phút)' })
  minTotalMinutes!: number;

  @ApiProperty({
    description: 'Tổng thời lượng các buổi chưa hủy đã xếp (phút)',
  })
  scheduledMinutes!: number;

  @ApiProperty({ type: [ClassWeekProgressDto] })
  weeks!: ClassWeekProgressDto[];
}
