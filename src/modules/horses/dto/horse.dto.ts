import {
  ApiProperty,
  ApiPropertyOptional,
  OmitType,
  PartialType,
} from '@nestjs/swagger';
import { Expose, Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { SortOrder } from '../../../common/enums/sort-order.enum';
import { HorseGender } from '../constants/horse-gender.enum';
import { HorseMeasurementType } from '../constants/horse-measurement-type.enum';
import { HorseListSortBy } from '../constants/horse-list-sort.enum';
import { HorseParentRole } from '../constants/horse-parent-role.enum';
import {
  HorseHealthStatus,
  HorseLifecycleStatus,
} from '../constants/horse-status.enum';
import { RaceAptitude } from '../constants/race-aptitude.enum';
import { EligibilityReason } from '../constants/eligibility-reason.enum';
import { HorseLatestMeasurementDto } from './horse-measure.dto';

export class CreateHorseDto {
  @ApiProperty({ maxLength: 160 })
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  name!: string;

  @ApiProperty({ enum: HorseGender })
  @IsEnum(HorseGender)
  gender!: HorseGender;

  @ApiPropertyOptional({ maxLength: 80, nullable: true, type: String })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  breed?: string | null;

  @ApiPropertyOptional({ maxLength: 40, nullable: true, type: String })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  color?: string | null;

  @ApiPropertyOptional({ enum: RaceAptitude, nullable: true })
  @IsOptional()
  @IsEnum(RaceAptitude)
  raceAptitude?: RaceAptitude | null;

  @ApiPropertyOptional({ maxLength: 80, nullable: true, type: String })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  microchipId?: string | null;

  @ApiPropertyOptional({ format: 'date', nullable: true, type: String })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'dateOfBirth must be in YYYY-MM-DD format',
  })
  @IsDateString({ strict: true })
  dateOfBirth?: string | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true, type: String })
  @IsOptional()
  @IsUUID()
  sireId?: string | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true, type: String })
  @IsOptional()
  @IsUUID()
  damId?: string | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true, type: String })
  @IsOptional()
  @IsUUID()
  mediaId?: string | null;

  @ApiPropertyOptional({
    default: false,
    description:
      'true cho ngựa giống bên ngoài, chỉ dùng làm tổ tiên trong phả hệ',
  })
  @IsOptional()
  @IsBoolean()
  isReference?: boolean;

  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'Xếp luôn vào ô chuồng này. Ô phải AVAILABLE, thuộc khu chuồng ACTIVE và chưa có ngựa. Không dùng cho ngựa tham chiếu',
  })
  @IsOptional()
  @IsUUID()
  stallId?: string;

  @ApiPropertyOptional({
    type: () => [HorseOwnerShareDto],
    description:
      'Gán luôn chủ sở hữu, tổng tỷ lệ phải bằng 100. Không dùng cho ngựa tham chiếu',
  })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => HorseOwnerShareDto)
  owners?: HorseOwnerShareDto[];
}

export class UpdateHorseDto extends PartialType(
  OmitType(CreateHorseDto, [
    'name',
    'gender',
    'isReference',
    'stallId',
    'owners',
  ] as const),
) {
  @ApiProperty({
    minimum: 1,
    description:
      'version của hồ sơ lấy từ lần GET gần nhất. Người khác đã lưu trước thì trả 409, cần GET lại',
  })
  @IsInt()
  @Min(1)
  version!: number;

  @ApiPropertyOptional({ maxLength: 160 })
  @ValidateIf((body: UpdateHorseDto) => body.name !== undefined)
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  name?: string;

  @ApiPropertyOptional({ enum: HorseGender })
  @ValidateIf((body: UpdateHorseDto) => body.gender !== undefined)
  @IsEnum(HorseGender)
  gender?: HorseGender;
}

export class HorseListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Tìm theo tên hoặc microchip' })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  search?: string;

  @ApiPropertyOptional({ enum: HorseHealthStatus })
  @IsOptional()
  @IsEnum(HorseHealthStatus)
  healthStatus?: HorseHealthStatus;

  @ApiPropertyOptional({ enum: HorseLifecycleStatus })
  @IsOptional()
  @IsEnum(HorseLifecycleStatus)
  lifecycleStatus?: HorseLifecycleStatus;

  @ApiPropertyOptional({ enum: HorseGender })
  @IsOptional()
  @IsEnum(HorseGender)
  gender?: HorseGender;

  @ApiPropertyOptional({ enum: RaceAptitude })
  @IsOptional()
  @IsEnum(RaceAptitude)
  raceAptitude?: RaceAptitude;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Lọc ngựa đang ở trong khu chuồng này',
  })
  @IsOptional()
  @IsUUID()
  barnId?: string;

  @ApiPropertyOptional({
    default: false,
    description: 'true để xem ngựa tham chiếu (chỉ Club Manager)',
  })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  reference: boolean = false;

  @ApiPropertyOptional({
    default: false,
    description: 'true để chỉ xem hồ sơ đã xóa (chỉ Club Manager)',
  })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  deleted: boolean = false;

  @ApiPropertyOptional({
    enum: HorseListSortBy,
    default: HorseListSortBy.NAME,
    description:
      'NAME: theo tên. HEALTH_PRIORITY: chấn thương/cách ly trước, rồi cần theo dõi, cuối cùng đủ điều kiện; cùng nhóm thì theo tên',
  })
  @IsOptional()
  @IsEnum(HorseListSortBy)
  sortBy: HorseListSortBy = HorseListSortBy.NAME;

  @ApiPropertyOptional({
    enum: SortOrder,
    default: SortOrder.ASC,
    description:
      'Chiều sắp xếp của sortBy. HEALTH_PRIORITY + ASC: nặng nhất lên đầu. Tên dùng để xếp các con cùng nhóm, luôn A→Z',
  })
  @IsOptional()
  @IsEnum(SortOrder)
  sortOrder: SortOrder = SortOrder.ASC;
}

export class UpdateHorseHealthDto {
  @ApiProperty({ enum: HorseHealthStatus })
  @IsEnum(HorseHealthStatus)
  healthStatus!: HorseHealthStatus;
}

export class UpdateHorseLifecycleDto {
  @ApiProperty({ enum: HorseLifecycleStatus })
  @IsEnum(HorseLifecycleStatus)
  lifecycleStatus!: HorseLifecycleStatus;

  @ApiProperty({
    minLength: 1,
    maxLength: 500,
    description: 'Lý do đổi vòng đời, bắt buộc',
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  reason!: string;
}

export class DeleteHorseDto {
  @ApiProperty({
    minLength: 1,
    maxLength: 500,
    description: 'Lý do xóa hồ sơ tạo nhầm, bắt buộc',
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  reason!: string;
}

export class HorseOwnerShareDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  ownerId!: string;

  @ApiProperty({ minimum: 0.01, maximum: 100 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(100)
  percentage!: number;

  @ApiPropertyOptional({
    default: false,
    description:
      'true nếu là chủ đại diện. Không bắt buộc, mỗi ngựa tối đa một đại diện',
  })
  @IsOptional()
  @IsBoolean()
  isRepresentative?: boolean;
}

export class SetHorseOwnersDto {
  @ApiProperty({ type: [HorseOwnerShareDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => HorseOwnerShareDto)
  owners!: HorseOwnerShareDto[];

  @ApiPropertyOptional({
    format: 'date-time',
    description:
      'Thời điểm chuyển nhượng, không gửi thì lấy thời điểm hiện tại. Không được ở tương lai (400) và phải sau lần gán chủ gần nhất (409). Dòng chủ cũ kết thúc (endAt) và dòng chủ mới bắt đầu (startAt) đúng thời điểm này; chủ không đổi tỉ lệ và cờ đại diện thì giữ nguyên dòng',
  })
  @IsOptional()
  @IsDateString()
  transferredAt?: string;
}

export class ActivateReferenceHorseDto {
  @ApiProperty({
    minimum: 1,
    description:
      'version của hồ sơ lấy từ lần GET gần nhất. Người khác đã lưu trước thì trả 409, cần GET lại',
  })
  @IsInt()
  @Min(1)
  version!: number;

  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'Xếp luôn vào ô chuồng này. Ô phải AVAILABLE, thuộc khu chuồng ACTIVE và chưa có ngựa',
  })
  @IsOptional()
  @IsUUID()
  stallId?: string;

  @ApiPropertyOptional({
    type: () => [HorseOwnerShareDto],
    description: 'Gán luôn chủ sở hữu, tổng tỷ lệ phải bằng 100',
  })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => HorseOwnerShareDto)
  owners?: HorseOwnerShareDto[];
}

export class HorseResponseDto {
  @Expose()
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @Expose()
  @ApiProperty()
  name!: string;

  @Expose()
  @ApiPropertyOptional({ enum: HorseGender, nullable: true })
  gender!: HorseGender | null;

  @Expose()
  @ApiPropertyOptional({ nullable: true, type: String })
  breed!: string | null;

  @Expose()
  @ApiPropertyOptional({ nullable: true, type: String })
  color!: string | null;

  @Expose()
  @ApiPropertyOptional({ enum: RaceAptitude, nullable: true })
  raceAptitude!: RaceAptitude | null;

  @Expose()
  @ApiPropertyOptional({ format: 'date', nullable: true, type: String })
  dateOfBirth!: string | null;

  @Expose()
  @ApiPropertyOptional({ nullable: true, type: String })
  microchipId!: string | null;

  @Expose()
  @ApiPropertyOptional({ format: 'uuid', nullable: true, type: String })
  mediaId!: string | null;

  @Expose()
  @ApiPropertyOptional({ format: 'uuid', nullable: true, type: String })
  sireId!: string | null;

  @Expose()
  @ApiPropertyOptional({ format: 'uuid', nullable: true, type: String })
  damId!: string | null;

  @Expose()
  @ApiProperty()
  isReference!: boolean;

  @Expose()
  @ApiProperty({ enum: HorseHealthStatus })
  healthStatus!: HorseHealthStatus;

  @Expose()
  @ApiProperty({ enum: HorseLifecycleStatus })
  lifecycleStatus!: HorseLifecycleStatus;

  @Expose()
  @ApiPropertyOptional({
    nullable: true,
    type: String,
    description: 'Lý do của lần đổi vòng đời gần nhất',
  })
  lifecycleReason!: string | null;

  @Expose()
  @ApiPropertyOptional({
    format: 'date-time',
    nullable: true,
    type: String,
    description: 'Thời điểm đổi vòng đời gần nhất',
  })
  lifecycleChangedAt!: Date | null;

  @Expose()
  @ApiProperty({ description: 'Gửi lại khi PATCH /horses/{id}' })
  version!: number;
}

export class HorseBarnSummaryDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  name!: string;
}

export class HorseStallSummaryDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  code!: string;

  @ApiProperty({
    type: HorseBarnSummaryDto,
    description: 'Khu chuồng chứa ô này',
  })
  barn!: HorseBarnSummaryDto;
}

export class HorseListItemDto extends HorseResponseDto {
  @ApiPropertyOptional({
    type: HorseStallSummaryDto,
    nullable: true,
    description:
      'Ô chuồng hiện tại kèm khu chuồng, null nếu chưa được xếp chuồng',
  })
  stall!: HorseStallSummaryDto | null;

  @ApiProperty({
    description:
      'Tính lúc đọc: true khi ngựa ACTIVE, sức khỏe ELIGIBLE, không phải ngựa tham chiếu và không có training lock đang mở',
  })
  canRegisterRace!: boolean;
}

export class HorsePersonDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  fullName!: string;
}

export class HorseDetailResponseDto extends OmitType(HorseResponseDto, [
  'sireId',
  'damId',
] as const) {
  @ApiPropertyOptional({
    format: 'uuid',
    nullable: true,
    type: String,
    description: 'Không có key khi caller là Groom',
  })
  sireId?: string | null;

  @ApiPropertyOptional({
    format: 'uuid',
    nullable: true,
    type: String,
    description: 'Không có key khi caller là Groom',
  })
  damId?: string | null;

  @ApiPropertyOptional({
    type: HorseStallSummaryDto,
    nullable: true,
    description:
      'Ô chuồng hiện tại kèm khu chuồng, null nếu chưa được xếp chuồng',
  })
  stall!: HorseStallSummaryDto | null;

  @ApiPropertyOptional({
    type: HorsePersonDto,
    nullable: true,
    description: 'Groom đang phụ trách, null nếu chưa giao',
  })
  groom!: HorsePersonDto | null;

  @ApiPropertyOptional({
    type: HorsePersonDto,
    nullable: true,
    description:
      'Chủ đại diện. Không có key khi caller là Veterinarian hoặc Groom; null khi ngựa chưa có chủ đại diện',
  })
  representativeOwner?: HorsePersonDto | null;

  @ApiProperty({
    type: [HorseLatestMeasurementDto],
    description: 'Giá trị mới nhất của từng loại chỉ số',
  })
  latestMeasurements!: HorseLatestMeasurementDto[];

  @ApiProperty()
  activeTrainingLock!: boolean;
}

export class HorseOwnershipResponseDto {
  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'Chỉ có ở dòng Club Manager xem và dòng của chính Horse Owner; dòng đồng sở hữu không có key',
  })
  id?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'Chỉ có ở dòng Club Manager xem và dòng của chính Horse Owner; dòng đồng sở hữu không có key',
  })
  horseId?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'Chỉ có ở dòng Club Manager xem và dòng của chính Horse Owner; dòng đồng sở hữu không có key',
  })
  ownerId?: string;

  @ApiProperty()
  ownerName!: string;

  @ApiPropertyOptional({
    description:
      'Club Manager thấy email mọi chủ; Horse Owner chỉ thấy email của chính mình, dòng khác không có key',
  })
  ownerEmail?: string;

  @ApiProperty()
  percentage!: string;

  @ApiPropertyOptional({
    format: 'date-time',
    description:
      'Thời điểm bắt đầu sở hữu (tính cả thời điểm này). Chỉ có ở dòng Club Manager xem và dòng của chính Horse Owner; dòng đồng sở hữu không có key',
  })
  startAt?: Date;

  @ApiPropertyOptional({
    format: 'date-time',
    nullable: true,
    description:
      'Thời điểm kết thúc sở hữu (không tính thời điểm này, trùng startAt của dòng chủ mới); null là đang sở hữu. Chỉ có ở dòng Club Manager xem và dòng của chính Horse Owner; dòng đồng sở hữu không có key',
  })
  endAt?: Date | null;

  @ApiProperty()
  isRepresentative!: boolean;
}

export class HorsePedigreeNodeResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiPropertyOptional({ enum: HorseGender, nullable: true })
  gender!: HorseGender | null;

  @ApiPropertyOptional({ nullable: true, type: String })
  breed!: string | null;

  @ApiPropertyOptional({ nullable: true, type: String })
  color!: string | null;

  @ApiPropertyOptional({ format: 'date', nullable: true, type: String })
  dateOfBirth!: string | null;

  @ApiPropertyOptional({ enum: RaceAptitude, nullable: true })
  raceAptitude!: RaceAptitude | null;

  @ApiProperty()
  isReference!: boolean;

  @ApiProperty({ minimum: 1, maximum: 4 })
  generation!: number;

  @ApiProperty({ enum: HorseParentRole })
  parentRole!: HorseParentRole;

  @ApiProperty({
    format: 'uuid',
    description: 'Ngựa con của node này trong cây',
  })
  childId!: string;
}

export class HorsePedigreeResponseDto {
  @ApiProperty({ format: 'uuid' })
  horseId!: string;

  @ApiProperty()
  horseName!: string;

  @ApiProperty({ minimum: 1, maximum: 4 })
  depth!: number;

  @ApiProperty({ type: [HorsePedigreeNodeResponseDto] })
  ancestors!: HorsePedigreeNodeResponseDto[];
}

export class HorseEligibilityResponseDto {
  @ApiProperty({ format: 'uuid' })
  horseId!: string;

  @ApiProperty()
  trainingEligible!: boolean;

  @ApiProperty()
  racingEligible!: boolean;

  @ApiProperty({ enum: HorseHealthStatus })
  healthStatus!: HorseHealthStatus;

  @ApiProperty({ enum: HorseLifecycleStatus })
  lifecycleStatus!: HorseLifecycleStatus;

  @ApiProperty()
  activeTrainingLock!: boolean;

  @ApiProperty({ enum: EligibilityReason, isArray: true })
  reasons!: EligibilityReason[];
}

export class HorsePermissionsResponseDto {
  @ApiProperty({ format: 'uuid' })
  horseId!: string;

  @ApiProperty({ description: 'Sửa hồ sơ ngựa' })
  canEdit!: boolean;

  @ApiProperty({
    description:
      'Sửa sở trường cự ly: Club Manager, hoặc Head Trainer khi ngựa ở khu mình phụ trách',
  })
  canEditRaceAptitude!: boolean;

  @ApiProperty({ description: 'Đổi trạng thái vòng đời' })
  canChangeLifecycle!: boolean;

  @ApiProperty({ description: 'Thay danh sách chủ sở hữu' })
  canManageOwners!: boolean;

  @ApiProperty({ description: 'Đổi trạng thái sức khỏe' })
  canChangeHealth!: boolean;

  @ApiProperty({ description: 'Ghi chỉ số cơ thể' })
  canRecordMeasurement!: boolean;

  @ApiProperty({
    enum: HorseMeasurementType,
    isArray: true,
    description:
      'Các loại chỉ số được ghi: Head Trainer (khu mình) cân nặng + thể trạng, Groom (ngựa được giao) cân nặng + thân nhiệt, Veterinarian cả bốn; rỗng nếu không ghi được',
  })
  recordableMeasurementTypes!: HorseMeasurementType[];

  @ApiProperty({ description: 'Mở tab phả hệ' })
  canViewPedigree!: boolean;

  @ApiProperty({ description: 'Mở tab chủ sở hữu' })
  canViewOwners!: boolean;

  @ApiProperty({ description: 'Mở tab lịch sử và biểu đồ chỉ số' })
  canViewMeasurementHistory!: boolean;

  @ApiProperty({ description: 'Mở tab hồ sơ y tế, gồm cả vết thương' })
  canViewMedicalRecords!: boolean;

  @ApiProperty({ description: 'Xem điểm đánh giá buổi tập' })
  canViewTrainingEvaluation!: boolean;

  @ApiProperty({ description: 'Xem biểu đồ chỉ số tổng hợp theo buổi tập' })
  canViewPerformance!: boolean;

  @ApiProperty({ description: 'Xem số đo thô của các buổi tập' })
  canViewPerformanceDetail!: boolean;

  @ApiProperty({ description: 'Mở hồ sơ ngựa tham chiếu từ cây phả hệ' })
  canOpenReferenceHorses!: boolean;

  @ApiProperty({
    description:
      'Kích hoạt ngựa tham chiếu thành ngựa của câu lạc bộ: chỉ Club Manager, chỉ với ngựa tham chiếu chưa xóa',
  })
  canActivateReference!: boolean;
}
