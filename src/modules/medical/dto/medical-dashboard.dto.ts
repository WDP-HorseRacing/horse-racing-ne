import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsIn, IsOptional, IsUUID } from 'class-validator';
import { toQueryBoolean } from '../../../common/utils/query-boolean';
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

  @ApiPropertyOptional({
    enum: ['me'],
    description:
      'me: khối careSchedules chỉ giữ lịch có người làm hiện tại là người gọi; không áp cho các khối khác',
  })
  @IsOptional()
  @IsIn(['me'])
  careAssignee?: 'me';

  @ApiPropertyOptional({
    description:
      'Chỉ ngựa thuộc các khu người gọi phụ trách; đi cùng barnId thì lấy phần giao',
  })
  @IsOptional()
  @Transform(toQueryBoolean)
  @IsBoolean()
  mine?: boolean;
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

  @ApiProperty({ type: String, nullable: true })
  barnName!: string | null;

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
 * Một con ngựa đang Chấn thương hoặc Cách ly mà chưa có bệnh án đang mở.
 */
export class DashboardHorseWithoutCaseDto {
  @ApiProperty({ format: 'uuid' })
  horseId!: string;

  @ApiProperty()
  horseName!: string;

  @ApiProperty({ format: 'uuid', nullable: true })
  barnId!: string | null;

  @ApiProperty({ type: String, nullable: true })
  barnName!: string | null;

  @ApiProperty({
    format: 'uuid',
    nullable: true,
    description: 'Ô đang xếp; null là ngựa chưa có ô',
  })
  stallId!: string | null;

  @ApiProperty({ type: String, nullable: true })
  stallCode!: string | null;

  @ApiProperty({
    enum: [HorseHealthStatus.INJURED, HorseHealthStatus.QUARANTINED],
  })
  healthStatus!: HorseHealthStatus;

  @ApiProperty({
    type: String,
    format: 'date-time',
    nullable: true,
    description:
      'Thời điểm chuyển sang trạng thái hiện tại theo nhật ký đổi sức khỏe; null nếu nhật ký không có',
  })
  since!: Date | null;
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
 * Một đơn thuốc đang hiệu lực hôm nay trên bảng điều khiển.
 */
export class DashboardPrescriptionDto {
  @ApiProperty({ format: 'uuid' })
  prescriptionId!: string;

  @ApiProperty({ format: 'uuid' })
  horseId!: string;

  @ApiProperty()
  horseName!: string;

  @ApiProperty()
  medicine!: string;

  @ApiProperty()
  dosage!: string;

  @ApiProperty()
  frequency!: string;

  @ApiProperty({ format: 'date' })
  startDate!: string;

  @ApiProperty({
    type: String,
    format: 'date',
    nullable: true,
    description: 'Ngày kết thúc, null nếu dùng tới khi đóng bệnh án',
  })
  endDate!: string | null;

  @ApiProperty({ format: 'uuid', description: 'Buổi khám kê đơn' })
  medicalRecordId!: string;

  @ApiProperty({
    type: String,
    format: 'uuid',
    nullable: true,
    description: 'Bệnh án chứa buổi khám, null nếu buổi khám ngoài bệnh án',
  })
  caseId!: string | null;
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

  @ApiProperty({
    format: 'uuid',
    nullable: true,
    description:
      'Người làm hiện tại (giao Groom phụ trách thì là Groom đang phụ trách ngựa), null nếu chưa có ai',
  })
  assignedTo!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Họ tên người làm hiện tại, null nếu chưa có ai',
  })
  assignedToName!: string | null;
}

/**
 * Bảng điều khiển y tế: bảy khối, tính trực tiếp khi mở, không có chi phí.
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
    type: [DashboardHorseWithoutCaseDto],
    description:
      'Ngựa đang Chấn thương hoặc Cách ly mà chưa có bệnh án đang mở; Cách ly lên trước, rồi chuyển trạng thái lâu nhất lên trước',
  })
  horsesWithoutCase!: DashboardHorseWithoutCaseDto[];

  @ApiProperty({
    type: [DashboardPrescriptionDto],
    description:
      'Thuốc cần cho hôm nay: đơn đang hiệu lực theo ngày lịch câu lạc bộ, theo tên ngựa',
  })
  todayPrescriptions!: DashboardPrescriptionDto[];

  @ApiProperty({
    type: [ExamRequestResponseDto],
    description: 'Yêu cầu khám đang chờ, Khẩn lên trước',
  })
  pendingRequests!: ExamRequestResponseDto[];
}
