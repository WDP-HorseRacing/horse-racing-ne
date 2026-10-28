import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { IsIsoInstant, trimValue } from '../../../common/utils/dto-input';
import { HorseMeasurementValueDto } from '../../horses/dto';
import { HorseHealthStatus } from '../../horses/enums/horse-status.enum';
import {
  MedicalVisitConclusion,
  MedicalVisitKind,
} from '../constants/medical-visit.enum';
import {
  InjuryBodyRegion,
  InjuryType,
  RecoveryStatus,
} from '../constants/injury-marker.enum';
import {
  CreateInjuryDto,
  InjuryPositionDto,
  UpdateInjuryStatusDto,
} from './create-injury.dto';
import { CreatePrescriptionDto } from './create-prescription.dto';

/**
 * Chỉ kiểm ô khi request có gửi; gửi null vẫn bị kiểm và bị chặn với ô không nhận null.
 *
 * @returns Decorator ValidateIf chỉ kiểm khi ô có trong request
 */
const WhenSent = () =>
  ValidateIf((_body: object, value: unknown) => value !== undefined);

/**
 * Chi phí tối đa nhập được cho một buổi khám (VND).
 */
export const MAX_VISIT_COST_VND = 10_000_000_000;

/**
 * Các trường chung của một buổi khám.
 */
export class MedicalVisitBaseDto {
  @ApiPropertyOptional({
    type: [String],
    format: 'uuid',
    description:
      'Các yêu cầu khám đang chờ của chính con ngựa được gắn vào buổi này',
  })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(20)
  @IsUUID('4', { each: true })
  requestIds?: string[];

  @ApiPropertyOptional({
    maxLength: 4000,
    description: 'Chẩn đoán, nhận xét, hướng điều trị (văn bản tự do)',
  })
  @IsOptional()
  @Transform(trimValue)
  @IsString()
  @MaxLength(4000)
  diagnosis?: string;

  @ApiPropertyOptional({
    enum: HorseHealthStatus,
    description: 'Trạng thái sức khỏe sau khám; bỏ trống là giữ nguyên',
  })
  @IsOptional()
  @IsEnum(HorseHealthStatus)
  healthStatus?: HorseHealthStatus;

  @ApiPropertyOptional({
    maxLength: 500,
    description: 'Bắt buộc khi trạng thái sức khỏe thay đổi',
  })
  @IsOptional()
  @Transform(trimValue)
  @IsString()
  @MaxLength(500)
  healthReason?: string;

  @ApiPropertyOptional({
    maxLength: 2000,
    description: 'Ghi chú chăm sóc, hạn chế vận động cho Head Trainer và Groom',
  })
  @IsOptional()
  @Transform(trimValue)
  @IsString()
  @MaxLength(2000)
  careInstructions?: string;

  @ApiPropertyOptional({
    format: 'date-time',
    example: '2026-10-23T00:30:00+07:00',
    description:
      'Ngày hẹn tái khám; chỉ dùng khi buổi khám thuộc bệnh án, không ở quá khứ',
  })
  @IsOptional()
  @IsIsoInstant()
  nextVisitAt?: string;

  @ApiPropertyOptional({ type: [HorseMeasurementValueDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => HorseMeasurementValueDto)
  measurements?: HorseMeasurementValueDto[];

  @ApiPropertyOptional({
    description: 'Xác nhận lưu số đo ngoài khoảng bình thường',
  })
  @IsOptional()
  @IsBoolean()
  confirmAbnormal?: boolean;

  @ApiPropertyOptional({ type: [CreatePrescriptionDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => CreatePrescriptionDto)
  prescriptions?: CreatePrescriptionDto[];

  @ApiPropertyOptional({
    type: [UpdateInjuryStatusDto],
    description:
      'Mức hồi phục mới của các chấn thương chưa lành; chấn thương không có trong danh sách giữ nguyên mức cũ. Chỉ dùng khi buổi khám thuộc bệnh án',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => UpdateInjuryStatusDto)
  injuryUpdates?: UpdateInjuryStatusDto[];

  @ApiPropertyOptional({
    type: [CreateInjuryDto],
    description:
      'Chấn thương phát hiện ở buổi khám này; chỉ dùng khi buổi khám thuộc bệnh án',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => CreateInjuryDto)
  newInjuries?: CreateInjuryDto[];

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Buổi khám đã hủy mà buổi này ghi thay',
  })
  @IsOptional()
  @IsUUID('4')
  replacesRecordId?: string;

  @ApiPropertyOptional({
    minimum: 0,
    maximum: MAX_VISIT_COST_VND,
    description: 'Chi phí của buổi khám, số nguyên VND; bỏ trống là 0',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_VISIT_COST_VND)
  cost?: number;
}

/**
 * Ghi buổi khám ngoài bệnh án. Kết luận ISSUE mở bệnh án ngay trong lần lưu.
 */
export class CreateStandaloneVisitDto extends MedicalVisitBaseDto {
  @ApiProperty({
    enum: [MedicalVisitKind.ROUTINE, MedicalVisitKind.REQUEST],
    description:
      'ROUTINE khám định kỳ; REQUEST khám theo yêu cầu (bắt buộc gắn ít nhất một yêu cầu)',
  })
  @IsEnum([MedicalVisitKind.ROUTINE, MedicalVisitKind.REQUEST])
  kind!: MedicalVisitKind.ROUTINE | MedicalVisitKind.REQUEST;

  @ApiProperty({ enum: MedicalVisitConclusion })
  @IsEnum(MedicalVisitConclusion)
  conclusion!: MedicalVisitConclusion;

  @ApiPropertyOptional({
    maxLength: 2000,
    description: 'Chẩn đoán ban đầu của bệnh án; bắt buộc khi kết luận ISSUE',
  })
  @IsOptional()
  @Transform(trimValue)
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  initialDiagnosis?: string;
}

/**
 * Ghi buổi tái khám trong bệnh án đang mở.
 */
export class CreateFollowUpVisitDto extends MedicalVisitBaseDto {}

/**
 * Điều chỉnh chi phí của một buổi khám, bắt buộc lý do.
 */
export class AdjustVisitCostDto {
  @ApiProperty({
    minimum: 0,
    maximum: MAX_VISIT_COST_VND,
    description: 'Chi phí mới của buổi khám, số nguyên VND',
  })
  @IsInt()
  @Min(0)
  @Max(MAX_VISIT_COST_VND)
  cost!: number;

  @ApiProperty({ minLength: 1, maxLength: 500 })
  @Transform(trimValue)
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  reason!: string;
}

/**
 * Hủy buổi khám ghi sai.
 */
export class VoidMedicalRecordDto {
  @ApiProperty({ minLength: 1, maxLength: 500 })
  @Transform(trimValue)
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  reason!: string;
}

/**
 * Sửa một chấn thương có trong buổi khám, theo id chấn thương.
 */
export class EditVisitInjuryDto {
  @ApiProperty({
    format: 'uuid',
    description: 'Chấn thương có ghi nhận trong buổi khám này',
  })
  @IsUUID('4')
  injuryId!: string;

  @ApiPropertyOptional({
    enum: RecoveryStatus,
    description: 'Mức hồi phục tại buổi khám này',
  })
  @WhenSent()
  @IsEnum(RecoveryStatus)
  recoveryStatus?: RecoveryStatus;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Ghi chú; null là xóa ghi chú',
  })
  @IsOptional()
  @IsString()
  notes?: string | null;

  @ApiPropertyOptional({
    enum: InjuryBodyRegion,
    description: 'Chỉ sửa được khi chấn thương được phát hiện ở buổi khám này',
  })
  @WhenSent()
  @IsEnum(InjuryBodyRegion)
  bodyRegion?: InjuryBodyRegion;

  @ApiPropertyOptional({
    enum: InjuryType,
    description: 'Chỉ sửa được khi chấn thương được phát hiện ở buổi khám này',
  })
  @WhenSent()
  @IsEnum(InjuryType)
  injuryType?: InjuryType;

  @ApiPropertyOptional({
    type: InjuryPositionDto,
    description: 'Chỉ sửa được khi chấn thương được phát hiện ở buổi khám này',
  })
  @WhenSent()
  @ValidateNested()
  @Type(() => InjuryPositionDto)
  position?: InjuryPositionDto;
}

/**
 * Sửa một buổi khám, bắt buộc lý do. Ô không gửi giữ nguyên; danh sách gửi lên thay toàn bộ.
 */
export class UpdateMedicalVisitDto {
  @ApiProperty({ minLength: 1, maxLength: 500 })
  @Transform(trimValue)
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  reason!: string;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    maxLength: 4000,
    description: 'Chẩn đoán, nhận xét; null là xóa',
  })
  @IsOptional()
  @Transform(trimValue)
  @IsString()
  @MaxLength(4000)
  diagnosis?: string | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    maxLength: 2000,
    description: 'Ghi chú chăm sóc; null là xóa',
  })
  @IsOptional()
  @Transform(trimValue)
  @IsString()
  @MaxLength(2000)
  careInstructions?: string | null;

  @ApiPropertyOptional({
    type: String,
    format: 'date-time',
    nullable: true,
    example: '2026-10-23T00:30:00+07:00',
    description:
      'Ngày hẹn tái khám, không ở quá khứ; chỉ dùng khi buổi khám thuộc bệnh án đang điều trị. null là bỏ hẹn',
  })
  @IsOptional()
  @IsIsoInstant()
  nextVisitAt?: string | null;

  @ApiPropertyOptional({
    enum: HorseHealthStatus,
    description:
      'Trạng thái sức khỏe sau khám; lý do đổi sức khỏe là reason của lần sửa',
  })
  @WhenSent()
  @IsEnum(HorseHealthStatus)
  healthStatus?: HorseHealthStatus;

  @ApiPropertyOptional({
    type: [HorseMeasurementValueDto],
    description:
      'Giá trị mới của các số đo đã ghi trong buổi khám, theo loại chỉ số; loại không gửi giữ nguyên',
  })
  @WhenSent()
  @IsArray()
  @ArrayMaxSize(4)
  @ValidateNested({ each: true })
  @Type(() => HorseMeasurementValueDto)
  measurements?: HorseMeasurementValueDto[];

  @ApiPropertyOptional({
    description: 'Xác nhận lưu số đo ngoài khoảng bình thường',
  })
  @WhenSent()
  @IsBoolean()
  confirmAbnormal?: boolean;

  @ApiPropertyOptional({
    type: [CreatePrescriptionDto],
    description: 'Thay toàn bộ đơn thuốc của buổi khám; [] là bỏ hết',
  })
  @WhenSent()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => CreatePrescriptionDto)
  prescriptions?: CreatePrescriptionDto[];

  @ApiPropertyOptional({
    type: [EditVisitInjuryDto],
    description:
      'Sửa các chấn thương có trong buổi khám, theo id chấn thương; chấn thương không gửi giữ nguyên',
  })
  @WhenSent()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => EditVisitInjuryDto)
  injuries?: EditVisitInjuryDto[];

  @ApiPropertyOptional({
    type: [String],
    format: 'uuid',
    description:
      'Xóa chấn thương được phát hiện ở buổi khám này; chỉ khi chưa buổi khám nào khác ghi nhận chấn thương đó',
  })
  @WhenSent()
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(20)
  @IsUUID('4', { each: true })
  removedInjuryIds?: string[];

  @ApiPropertyOptional({
    enum: [MedicalVisitKind.ROUTINE, MedicalVisitKind.REQUEST],
    description: 'Chỉ với buổi khám ngoài bệnh án hoặc buổi mở bệnh án',
  })
  @WhenSent()
  @IsEnum([MedicalVisitKind.ROUTINE, MedicalVisitKind.REQUEST])
  kind?: MedicalVisitKind.ROUTINE | MedicalVisitKind.REQUEST;

  @ApiPropertyOptional({
    type: [String],
    format: 'uuid',
    description:
      'Thay toàn bộ yêu cầu khám gắn với buổi khám: yêu cầu bị bỏ về Chờ xử lý, yêu cầu mới phải đang chờ của chính con ngựa',
  })
  @WhenSent()
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(20)
  @IsUUID('4', { each: true })
  requestIds?: string[];

  @ApiPropertyOptional({
    enum: MedicalVisitConclusion,
    description:
      'Chỉ với buổi khám ngoài bệnh án hoặc buổi mở bệnh án. NORMAL -> ISSUE mở bệnh án; ISSUE -> NORMAL hủy bệnh án buổi này đã mở',
  })
  @WhenSent()
  @IsEnum(MedicalVisitConclusion)
  conclusion?: MedicalVisitConclusion;

  @ApiPropertyOptional({
    maxLength: 2000,
    description:
      'Chẩn đoán ban đầu của bệnh án do buổi khám này mở; bắt buộc khi đổi sang ISSUE',
  })
  @WhenSent()
  @Transform(trimValue)
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  initialDiagnosis?: string;
}
