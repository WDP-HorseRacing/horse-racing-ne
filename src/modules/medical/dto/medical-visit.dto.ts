import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { HorseMeasurementValueDto } from '../../horses/dto';
import { HorseHealthStatus } from '../../horses/enums/horse-status.enum';
import {
  MedicalVisitConclusion,
  MedicalVisitKind,
} from '../constants/medical-visit.enum';
import { CreateInjuryDto } from './create-injury.dto';
import { CreatePrescriptionDto } from './create-prescription.dto';

/**
 * Chuỗi ngày theo lịch, không kèm giờ (YYYY-MM-DD).
 */
export const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Cắt khoảng trắng hai đầu nếu giá trị là chuỗi, dùng cho @Transform của các ô văn bản
 *
 * @param params Tham số của class-transformer
 * @returns Chuỗi đã cắt, hoặc giá trị gốc nếu không phải chuỗi
 */
export function trimValue({ value }: { value: unknown }): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

/**
 * Các trường chung của một buổi khám.
 */
export class MedicalVisitBaseDto {
  @ApiPropertyOptional({
    format: 'date-time',
    description:
      'Thời điểm khám; mặc định hiện tại. Không ở tương lai, lùi tối đa 7 ngày',
  })
  @IsOptional()
  @IsDateString()
  examDate?: string;

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
    description:
      'Ngày hẹn tái khám; chỉ dùng khi buổi khám thuộc bệnh án, không ở quá khứ',
  })
  @IsOptional()
  @IsDateString()
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
    type: [CreateInjuryDto],
    description: 'Chấn thương; chỉ dùng khi buổi khám thuộc bệnh án',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => CreateInjuryDto)
  injuries?: CreateInjuryDto[];

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Buổi khám đã hủy mà buổi này ghi thay',
  })
  @IsOptional()
  @IsUUID('4')
  replacesRecordId?: string;
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
