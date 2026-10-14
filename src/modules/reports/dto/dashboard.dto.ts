import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsUUID } from 'class-validator';
import { toQueryBoolean } from '../../../common/utils/query-boolean';
import { HorseHealthStatus } from '../../horses/enums/horse-status.enum';
import { ReportPeriodDto } from './report-period.dto';

export class DashboardQueryDto extends ReportPeriodDto {
  @ApiPropertyOptional({ format: 'uuid', description: 'Chỉ ngựa của một khu' })
  @IsOptional()
  @IsUUID('4')
  barnId?: string;

  @ApiPropertyOptional({
    description: 'Chỉ ngựa thuộc các khu người gọi phụ trách',
  })
  @IsOptional()
  @Transform(toQueryBoolean)
  @IsBoolean()
  mine?: boolean;
}

export class DashboardHealthCountsDto {
  @ApiProperty() ELIGIBLE!: number;
  @ApiProperty() UNDER_OBSERVATION!: number;
  @ApiProperty() INJURED!: number;
  @ApiProperty() QUARANTINED!: number;
}

export class DashboardHerdDto {
  @ApiProperty({ description: 'Số ngựa đang hoạt động trong phạm vi' })
  total!: number;

  @ApiProperty({ type: DashboardHealthCountsDto })
  byHealthStatus!: DashboardHealthCountsDto;

  @ApiProperty({ description: 'Số ngựa đang bị khóa huấn luyện' })
  trainingLocked!: number;
}

export class DashboardIntensityCountsDto {
  @ApiProperty() LIGHT!: number;
  @ApiProperty() MODERATE!: number;
  @ApiProperty() HEAVY!: number;
}

export class DashboardTrainingDto {
  @ApiProperty({
    description:
      'Số buổi đang diễn ra hoặc đã xong trong kỳ có ngựa trong phạm vi',
  })
  sessions!: number;

  @ApiProperty({ description: 'Số lượt hoàn thành' })
  completed!: number;

  @ApiProperty({ description: 'Số lượt vắng' })
  absent!: number;

  @ApiProperty({
    description: 'Số lượt không đủ điều kiện (kể cả hủy do khóa huấn luyện)',
  })
  ineligible!: number;

  @ApiProperty({
    type: DashboardIntensityCountsDto,
    description: 'Số lượt hoàn thành theo cường độ buổi',
  })
  completedByIntensity!: DashboardIntensityCountsDto;
}

export class DashboardWeekDto {
  @ApiProperty({ format: 'date', description: 'Thứ Hai đầu tuần (lịch CLB)' })
  weekStart!: string;

  @ApiProperty({ description: 'Số lượt hoàn thành trong tuần' })
  completed!: number;

  @ApiProperty({
    type: Number,
    nullable: true,
    description: 'Nhịp tim trung bình (bpm); null khi không có điểm đo',
  })
  avgHeartRateBpm!: number | null;

  @ApiProperty({
    type: Number,
    nullable: true,
    description: 'Tốc độ trung bình (m/s); null khi không có điểm đo',
  })
  avgSpeedMps!: number | null;

  @ApiProperty({ description: 'Số điểm đo vượt ngưỡng (WARNING, CRITICAL)' })
  alertCount!: number;
}

export class DashboardHorseDto {
  @ApiProperty({ format: 'uuid' }) horseId!: string;
  @ApiProperty() horseName!: string;

  @ApiProperty({ format: 'uuid', nullable: true, type: String })
  barnId!: string | null;

  @ApiProperty({ nullable: true, type: String })
  barnName!: string | null;

  @ApiProperty({ enum: HorseHealthStatus })
  healthStatus!: HorseHealthStatus;

  @ApiProperty() trainingLocked!: boolean;

  @ApiProperty({ description: 'Số lượt hoàn thành trong kỳ' })
  completed!: number;

  @ApiProperty({ type: Number, nullable: true })
  avgHeartRateBpm!: number | null;

  @ApiProperty({ type: Number, nullable: true })
  maxHeartRateBpm!: number | null;

  @ApiProperty({ type: Number, nullable: true })
  avgSpeedMps!: number | null;

  @ApiProperty({ type: Number, nullable: true })
  maxSpeedMps!: number | null;

  @ApiProperty({ description: 'Số điểm đo vượt ngưỡng trong kỳ' })
  alertCount!: number;

  @ApiProperty({
    type: Number,
    nullable: true,
    description: 'Cân nặng gần nhất (kg)',
  })
  latestWeightKg!: number | null;
}

export class DashboardResponseDto {
  @ApiProperty({ format: 'date' }) from!: string;
  @ApiProperty({ format: 'date' }) to!: string;
  @ApiProperty({ type: DashboardHerdDto }) herd!: DashboardHerdDto;
  @ApiProperty({ type: DashboardTrainingDto }) training!: DashboardTrainingDto;
  @ApiProperty({ type: [DashboardWeekDto] }) weekly!: DashboardWeekDto[];
  @ApiProperty({ type: [DashboardHorseDto] }) horses!: DashboardHorseDto[];
}
