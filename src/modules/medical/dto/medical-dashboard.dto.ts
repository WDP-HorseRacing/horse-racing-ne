import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { HorseHealthStatus } from '../../horses/enums/horse-status.enum';
import { CareScheduleType } from '../constants/care-schedule.enum';
import { CheckupItemDto } from './checkup.dto';
import { ExamRequestResponseDto } from './exam-request.dto';

/**
 * Bộ lọc bảng điều khiển y tế theo khu và trạng thái sức khỏe.
 */
export class MedicalDashboardQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4')
  barnId?: string;

  @ApiPropertyOptional({ enum: HorseHealthStatus })
  @IsOptional()
  @IsEnum(HorseHealthStatus)
  healthStatus?: HorseHealthStatus;
}

/**
 * Một con ngựa trong sơ đồ đàn.
 */
export class HerdHorseDto {
  @ApiProperty({ format: 'uuid' })
  horseId!: string;

  @ApiProperty()
  horseName!: string;

  @ApiProperty({ format: 'uuid', nullable: true })
  barnId!: string | null;

  @ApiProperty({
    format: 'uuid',
    nullable: true,
    description: 'Ô đang xếp; null là ngựa chưa có ô',
  })
  stallId!: string | null;

  @ApiProperty({ type: String, nullable: true })
  stallCode!: string | null;

  @ApiProperty({ enum: HorseHealthStatus })
  healthStatus!: HorseHealthStatus;
}

/**
 * Số con theo từng trạng thái sức khỏe.
 */
export class HerdCountsDto {
  @ApiProperty()
  QUARANTINED!: number;

  @ApiProperty()
  INJURED!: number;

  @ApiProperty()
  UNDER_OBSERVATION!: number;

  @ApiProperty()
  ELIGIBLE!: number;
}

/**
 * Khối 1: sơ đồ đàn ngựa theo trạng thái sức khỏe, Cách ly và Chấn thương lên đầu.
 */
export class HerdBlockDto {
  @ApiProperty({ type: HerdCountsDto })
  counts!: HerdCountsDto;

  @ApiProperty({ type: [HerdHorseDto] })
  horses!: HerdHorseDto[];
}

/**
 * Một bệnh án đang mở trên bảng điều khiển.
 */
export class DashboardOpenCaseDto {
  @ApiProperty({ format: 'uuid' })
  caseId!: string;

  @ApiProperty({ format: 'uuid' })
  horseId!: string;

  @ApiProperty()
  horseName!: string;

  @ApiProperty()
  initialDiagnosis!: string;

  @ApiProperty({ format: 'date-time' })
  openedAt!: Date;

  @ApiProperty({ format: 'date-time', nullable: true })
  lastVisitAt!: Date | null;

  @ApiProperty({
    format: 'date-time',
    nullable: true,
    description: 'Ngày hẹn tái khám của buổi khám gần nhất',
  })
  nextVisitAt!: Date | null;
}

/**
 * Một lịch chăm sóc đã đến hạn hoặc sắp đến hạn trên bảng điều khiển.
 */
export class DashboardCareScheduleDto {
  @ApiProperty({ format: 'uuid' })
  scheduleId!: string;

  @ApiProperty({ format: 'uuid' })
  horseId!: string;

  @ApiProperty()
  horseName!: string;

  @ApiProperty({ enum: CareScheduleType })
  type!: CareScheduleType;

  @ApiProperty({ format: 'date' })
  dueDate!: string;

  @ApiProperty({ format: 'uuid', nullable: true })
  assignedTo!: string | null;
}

/**
 * Bảng điều khiển y tế: bốn khối, tính trực tiếp khi mở, không có chi phí.
 */
export class MedicalDashboardResponseDto {
  @ApiProperty({ type: HerdBlockDto })
  herd!: HerdBlockDto;

  @ApiProperty({
    type: [CheckupItemDto],
    description: 'Các con quá hạn và đến hạn trong 3 ngày tới, quá hạn lên đầu',
  })
  checkups!: CheckupItemDto[];

  @ApiProperty({
    type: [DashboardCareScheduleDto],
    description:
      'Lịch tiêm phòng, tẩy giun, kiểm tra móng quá hạn hoặc đến hạn trong 3 ngày tới',
  })
  careSchedules!: DashboardCareScheduleDto[];

  @ApiProperty({ type: [DashboardOpenCaseDto] })
  openCases!: DashboardOpenCaseDto[];

  @ApiProperty({
    type: [ExamRequestResponseDto],
    description: 'Yêu cầu khám đang chờ, Khẩn lên trước',
  })
  pendingRequests!: ExamRequestResponseDto[];
}
