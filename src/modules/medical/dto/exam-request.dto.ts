import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { PaginationMetaDto } from '../../../common/dto/pagination-response.dto';
import { HorseMeasurementAlert } from '../../horses/enums/horse-measurement-alert.enum';
import {
  ExamRequestSource,
  ExamRequestStatus,
} from '../constants/exam-request.enum';
import { trimValue } from './medical-visit.dto';

/**
 * Chuyển chuỗi query "true"/"false" thành boolean
 *
 * @param params Tham số của class-transformer
 * @returns Boolean, hoặc giá trị gốc nếu không phải chuỗi true/false
 */
function toBoolean({ value }: { value: unknown }): unknown {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return value;
}

/**
 * Gửi yêu cầu khám khi ngựa có vấn đề (F3.4 mục 1).
 */
export class CreateExamRequestDto {
  @ApiProperty({ minLength: 1, maxLength: 2000, description: 'Mô tả dấu hiệu' })
  @Transform(trimValue)
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  description!: string;

  @ApiPropertyOptional({ default: false, description: 'Mức Khẩn' })
  @IsOptional()
  @IsBoolean()
  urgent?: boolean;
}

/**
 * Bác sĩ đổi mức độ của yêu cầu đang chờ, bắt buộc lý do (F3.4 mục 5).
 */
export class UpdateExamRequestUrgencyDto {
  @ApiProperty()
  @IsBoolean()
  urgent!: boolean;

  @ApiProperty({ minLength: 1, maxLength: 500 })
  @Transform(trimValue)
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  reason!: string;
}

/**
 * Bác sĩ bỏ qua yêu cầu khám, bắt buộc lý do (F3.4 mục 4).
 */
export class DismissExamRequestDto {
  @ApiProperty({ minLength: 1, maxLength: 500 })
  @Transform(trimValue)
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  reason!: string;
}

/**
 * Lọc hàng đợi yêu cầu khám.
 */
export class ExamRequestListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    enum: ExamRequestStatus,
    description: 'Mặc định PENDING',
  })
  @IsOptional()
  @IsEnum(ExamRequestStatus)
  status?: ExamRequestStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  urgent?: boolean;
}

/**
 * Một yêu cầu khám.
 */
export class ExamRequestResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  horseId!: string;

  @ApiProperty()
  horseName!: string;

  @ApiProperty({
    format: 'uuid',
    nullable: true,
    description: 'null khi hệ thống tự sinh từ cảnh báo chỉ số',
  })
  requestedBy!: string | null;

  @ApiProperty({ description: 'True khi hệ thống tự sinh yêu cầu' })
  requestedBySystem!: boolean;

  @ApiProperty({ enum: ExamRequestSource })
  source!: ExamRequestSource;

  @ApiProperty()
  urgent!: boolean;

  @ApiProperty()
  description!: string;

  @ApiProperty({ enum: ExamRequestStatus })
  status!: ExamRequestStatus;

  @ApiProperty({ type: String, nullable: true })
  dismissReason!: string | null;

  @ApiProperty({ format: 'uuid', nullable: true })
  handledBy!: string | null;

  @ApiProperty({
    description: 'True khi hệ thống tự xử lý (ví dụ bỏ qua do chuyển nhượng)',
  })
  handledBySystem!: boolean;

  @ApiProperty({ format: 'date-time', nullable: true })
  handledAt!: Date | null;

  @ApiProperty({ format: 'uuid', nullable: true })
  medicalRecordId!: string | null;

  @ApiProperty({ enum: HorseMeasurementAlert, nullable: true })
  alertType!: HorseMeasurementAlert | null;

  @ApiProperty({ format: 'date-time' })
  createdAt!: Date;
}

/**
 * Một trang yêu cầu khám.
 */
export class ExamRequestPageResponseDto {
  @ApiProperty({ type: [ExamRequestResponseDto] })
  items!: ExamRequestResponseDto[];

  @ApiProperty({ type: PaginationMetaDto })
  @Type(() => PaginationMetaDto)
  meta!: PaginationMetaDto;
}
