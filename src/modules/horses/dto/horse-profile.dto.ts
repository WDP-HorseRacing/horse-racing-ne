import {
  ApiProperty,
  ApiPropertyOptional,
  OmitType,
  PartialType,
} from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { PaginationMetaDto } from '../../../common/dto/pagination-response.dto';
import { SortOrder } from '../../../common/enums/sort-order.enum';
import { HorseGender } from '../enums/horse-gender.enum';
import { HorseListSortBy } from '../enums/horse-list-sort.enum';
import { HorsePlacementStatus } from '../enums/horse-placement-status.enum';
import {
  HorseHealthStatus,
  HorseLifecycleStatus,
} from '../enums/horse-status.enum';
import { RaceAptitude } from '../enums/race-aptitude.enum';
import { HorseLatestMeasurementDto } from './horse-measure.dto';
import {
  HorseResponseDto,
  HorseLocationDto,
  HorsePersonDto,
  HorseEligibilityDto,
} from './horse.dto';

export class CreateHorseDto {
  @ApiProperty({ maxLength: 160 })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
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

  @ApiPropertyOptional({
    format: 'uuid',
    nullable: true,
    type: String,
    description:
      'Ảnh đại diện: media đã tải lên, định dạng JPEG/PNG/WebP, tối đa 10 MB',
  })
  @IsOptional()
  @IsUUID()
  mediaId?: string | null;

  @ApiPropertyOptional({
    format: 'uuid',
    nullable: true,
    type: String,
    description:
      'Chủ sở hữu duy nhất, là tài khoản HORSE_OWNER đang hoạt động. Để trống thì gán sau bằng PATCH',
  })
  @IsOptional()
  @IsUUID()
  ownerId?: string | null;

  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'Xếp luôn vào khu chuồng này. Khu phải đang hoạt động, có Head Trainer phụ trách và còn ô trống. Để trống thì ngựa vào danh sách "Chờ xếp khu"',
  })
  @IsOptional()
  @IsUUID()
  barnId?: string;
}
export class UpdateHorseDto extends PartialType(
  OmitType(CreateHorseDto, ['name', 'gender', 'barnId'] as const),
) {
  @ApiPropertyOptional({
    enum: RaceAptitude,
    nullable: true,
    description:
      'Chỉ Head Trainer phụ trách khu được sửa. Không nhập lúc tạo hồ sơ (BA chốt), Head Trainer bổ sung sau',
  })
  @IsOptional()
  @IsEnum(RaceAptitude)
  raceAptitude?: RaceAptitude | null;

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
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
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
    description: 'Lọc ngựa thuộc khu chuồng này',
  })
  @IsOptional()
  @IsUUID()
  barnId?: string;

  @ApiPropertyOptional({
    enum: HorsePlacementStatus,
    description:
      'PENDING_BARN: "Chờ xếp khu". PENDING_STALL: "Chờ xếp ô". PLACED: đã có khu và ô. NOT_APPLICABLE: đã chuyển nhượng',
  })
  @IsOptional()
  @IsEnum(HorsePlacementStatus)
  placementStatus?: HorsePlacementStatus;

  @ApiPropertyOptional({
    default: false,
    description:
      '"Khu của tôi": chỉ ngựa thuộc các khu người gọi làm Head Trainer',
  })
  @IsOptional()
  @Transform(({ value }) => parseQueryBoolean(value))
  @IsBoolean()
  myBarns: boolean = false;

  @ApiPropertyOptional({
    default: false,
    description:
      '"Ngựa tôi phụ trách": chỉ ngựa người gọi đang là Groom phụ trách',
  })
  @IsOptional()
  @Transform(({ value }) => parseQueryBoolean(value))
  @IsBoolean()
  myHorses: boolean = false;

  @ApiPropertyOptional({
    default: false,
    description:
      'true để hiện thêm hồ sơ đã xóa, kèm isDeleted = true (chỉ Club Manager)',
  })
  @IsOptional()
  @Transform(({ value }) => parseQueryBoolean(value))
  @IsBoolean()
  includeDeleted: boolean = false;

  @ApiPropertyOptional({
    enum: HorseListSortBy,
    default: HorseListSortBy.HEALTH_PRIORITY,
    description:
      'NAME: theo tên. HEALTH_PRIORITY: chấn thương/cách ly trước, rồi cần theo dõi, cuối cùng đủ điều kiện; cùng nhóm thì theo tên',
  })
  @IsOptional()
  @IsEnum(HorseListSortBy)
  sortBy: HorseListSortBy = HorseListSortBy.HEALTH_PRIORITY;

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
/** Preserve invalid query values so class-validator can reject them. */
function parseQueryBoolean(value: unknown): unknown {
  if (value === true || value === 'true') return true;
  if (value === false || value === 'false') return false;
  return value;
}
export class HorseListItemDto extends HorseResponseDto {
  @ApiProperty({ type: HorseLocationDto })
  location!: HorseLocationDto;

  @ApiProperty({
    description:
      'Tính lúc đọc: true khi hồ sơ chưa xóa, ngựa ACTIVE, sức khỏe ELIGIBLE và không có lệnh khóa huấn luyện',
  })
  canRegisterRace!: boolean;

  @ApiProperty({
    description: 'true nếu hồ sơ đã xóa (chỉ Club Manager thấy được)',
  })
  isDeleted!: boolean;
}
export class HorseDetailResponseDto extends HorseResponseDto {
  @ApiProperty({ type: HorseLocationDto })
  location!: HorseLocationDto;

  @ApiPropertyOptional({
    type: HorsePersonDto,
    nullable: true,
    description: 'Groom đang phụ trách, null nếu chưa phân công',
  })
  groom!: HorsePersonDto | null;

  @ApiPropertyOptional({
    type: HorsePersonDto,
    nullable: true,
    description: 'Chủ sở hữu, null nếu chưa gán',
  })
  owner!: HorsePersonDto | null;

  @ApiProperty({
    type: [HorseLatestMeasurementDto],
    description: 'Giá trị mới nhất của từng loại chỉ số',
  })
  latestMeasurements!: HorseLatestMeasurementDto[];

  @ApiProperty()
  activeTrainingLock!: boolean;

  @ApiProperty({ type: HorseEligibilityDto })
  eligibility!: HorseEligibilityDto;

  @ApiProperty({
    description:
      'true nếu hồ sơ đã xóa (chỉ Club Manager mở được), khi đó chỉ đọc',
  })
  isDeleted!: boolean;
}

export class HorseListPageDto {
  @ApiProperty({ type: [HorseListItemDto] })
  items!: HorseListItemDto[];

  @ApiProperty({ type: PaginationMetaDto })
  meta!: PaginationMetaDto;
}

export class HorsePhotoUrlResponseDto {
  @ApiProperty({
    description: 'Presigned GET URL có hạn dùng để tải ảnh đại diện của ngựa',
  })
  url!: string;
}
