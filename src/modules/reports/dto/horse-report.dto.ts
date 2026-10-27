import { ApiProperty } from '@nestjs/swagger';
import { HorseHealthStatus } from '../../horses/enums/horse-status.enum';
import { HorseMeasurementType } from '../../horses/enums/horse-measurement-type.enum';
import {
  InjuryBodyRegion,
  InjuryType,
  RecoveryStatus,
} from '../../medical/constants/injury-marker.enum';
import { MedicalCaseStatus } from '../../medical/constants/medical-case.enum';
import { TrainingLockStatus } from '../../medical/constants/training-lock.enum';
import { SessionParticipantStatus } from '../../training/enums/session-participant-status.enum';
import { TrainingIntensity } from '../../training/enums/training-intensity.enum';
import { TrainingSessionType } from '../../training/enums/training-session-type.enum';
import { DashboardIntensityCountsDto } from './dashboard.dto';
import { ReportWeekDto } from './report-week.dto';

export class HorseProgressTotalsDto {
  @ApiProperty({ description: 'Số lượt hoàn thành' }) completed!: number;
  @ApiProperty({ description: 'Số lượt dừng sớm' }) stopped!: number;
  @ApiProperty({ description: 'Số lượt vắng' }) absent!: number;

  @ApiProperty({
    description: 'Số lượt không đủ điều kiện (kể cả hủy do khóa huấn luyện)',
  })
  ineligible!: number;

  @ApiProperty({
    description: 'Tổng cự ly dự kiến của các lượt hoàn thành (m)',
  })
  plannedDistanceM!: number;

  @ApiProperty({
    description:
      'Tổng thời gian tập thực tế của các lượt hoàn thành và dừng sớm (phút)',
  })
  trainedMinutes!: number;

  @ApiProperty({ type: DashboardIntensityCountsDto })
  completedByIntensity!: DashboardIntensityCountsDto;
}

export class HorseProgressEvaluationDto {
  @ApiProperty() score!: number;
  @ApiProperty({ type: String, nullable: true }) comment!: string | null;
}

export class HorseProgressSessionDto {
  @ApiProperty({ format: 'uuid' }) participantId!: string;
  @ApiProperty({ format: 'uuid' }) sessionId!: string;
  @ApiProperty() sessionName!: string;
  @ApiProperty({ format: 'date-time' }) scheduledStartAt!: Date;
  @ApiProperty({ enum: TrainingSessionType }) sessionType!: TrainingSessionType;
  @ApiProperty({ enum: TrainingIntensity }) intensity!: TrainingIntensity;
  @ApiProperty() plannedDistanceM!: number;
  @ApiProperty({ enum: SessionParticipantStatus })
  status!: SessionParticipantStatus;
  @ApiProperty({ type: Number, nullable: true }) avgHeartRateBpm!:
    number | null;
  @ApiProperty({ type: Number, nullable: true }) maxHeartRateBpm!:
    number | null;
  @ApiProperty({ type: Number, nullable: true }) avgSpeedMps!: number | null;
  @ApiProperty({ type: Number, nullable: true }) maxSpeedMps!: number | null;
  @ApiProperty({ description: 'Số điểm đo vượt ngưỡng' }) alertCount!: number;

  @ApiProperty({ type: HorseProgressEvaluationDto, nullable: true })
  evaluation!: HorseProgressEvaluationDto | null;

  @ApiProperty({
    type: Number,
    nullable: true,
    description: 'Thời gian chạy thử tốt nhất của lượt (ms)',
  })
  bestTrialMs!: number | null;
}

export class HorseProgressResponseDto {
  @ApiProperty({ format: 'uuid' }) horseId!: string;
  @ApiProperty() horseName!: string;
  @ApiProperty({ format: 'date' }) from!: string;
  @ApiProperty({ format: 'date' }) to!: string;
  @ApiProperty({ type: HorseProgressTotalsDto })
  totals!: HorseProgressTotalsDto;
  @ApiProperty({ type: [ReportWeekDto] }) weekly!: ReportWeekDto[];

  @ApiProperty({
    type: [HorseProgressSessionDto],
    description: 'Các lượt tập trong kỳ, theo giờ bắt đầu buổi',
  })
  sessions!: HorseProgressSessionDto[];
}

export class HorseHealthChangeDto {
  @ApiProperty({ format: 'date-time' }) changedAt!: Date;
  @ApiProperty({ enum: HorseHealthStatus, nullable: true })
  from!: HorseHealthStatus | null;
  @ApiProperty({ enum: HorseHealthStatus }) to!: HorseHealthStatus;
  @ApiProperty({ type: String, nullable: true }) reason!: string | null;
}

export class HorseMeasurementPointDto {
  @ApiProperty({ enum: HorseMeasurementType }) type!: HorseMeasurementType;
  @ApiProperty() value!: number;
  @ApiProperty({ format: 'date-time' }) measuredAt!: Date;
  @ApiProperty() isAbnormal!: boolean;
}

export class HorseMedicalCaseItemDto {
  @ApiProperty({ format: 'uuid' }) caseId!: string;
  @ApiProperty({ enum: MedicalCaseStatus }) status!: MedicalCaseStatus;
  @ApiProperty({ format: 'date-time' }) openedAt!: Date;
  @ApiProperty({ format: 'date-time', nullable: true, type: Date })
  closedAt!: Date | null;
  @ApiProperty() initialDiagnosis!: string;
  @ApiProperty({ type: String, nullable: true })
  finalConclusion!: string | null;
}

export class HorseInjuryItemDto {
  @ApiProperty({ format: 'date-time' }) examDate!: Date;
  @ApiProperty({ enum: InjuryBodyRegion }) bodyRegion!: InjuryBodyRegion;
  @ApiProperty({ enum: InjuryType }) injuryType!: InjuryType;
  @ApiProperty({ enum: RecoveryStatus }) recoveryStatus!: RecoveryStatus;
}

export class HorseTrainingLockItemDto {
  @ApiProperty({ format: 'uuid' }) lockId!: string;
  @ApiProperty({ enum: TrainingLockStatus }) status!: TrainingLockStatus;
  @ApiProperty() reason!: string;
  @ApiProperty({ format: 'date-time' }) lockStart!: Date;
  @ApiProperty({ format: 'date-time', nullable: true, type: Date })
  lockEnd!: Date | null;
  @ApiProperty({ format: 'date-time', nullable: true, type: Date })
  releasedAt!: Date | null;
}

export class HorseHealthResponseDto {
  @ApiProperty({ format: 'uuid' }) horseId!: string;
  @ApiProperty() horseName!: string;
  @ApiProperty({ format: 'date' }) from!: string;
  @ApiProperty({ format: 'date' }) to!: string;
  @ApiProperty({ enum: HorseHealthStatus })
  currentHealthStatus!: HorseHealthStatus;

  @ApiProperty({ type: [HorseHealthChangeDto] })
  statusChanges!: HorseHealthChangeDto[];

  @ApiProperty({ type: [HorseMeasurementPointDto] })
  measurements!: HorseMeasurementPointDto[];

  @ApiProperty({
    type: [HorseMedicalCaseItemDto],
    description:
      'Bệnh án mở trong kỳ hoặc còn mở trong một phần của kỳ, không gồm bệnh án đã hủy',
  })
  medicalCases!: HorseMedicalCaseItemDto[];

  @ApiProperty({ type: [HorseInjuryItemDto] })
  injuries!: HorseInjuryItemDto[];

  @ApiProperty({
    type: [HorseTrainingLockItemDto],
    description: 'Lệnh khóa huấn luyện có hiệu lực trong một phần của kỳ',
  })
  trainingLocks!: HorseTrainingLockItemDto[];
}
