import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import {
  CaseLockDecision,
  MedicalCaseStatus,
} from '../constants/medical-case.enum';
import { DATE_ONLY_PATTERN, trimValue } from './medical-visit.dto';

/**
 * Chi phí tối đa nhập được cho một bệnh án (VND), chặn gõ nhầm quá nhiều chữ số.
 */
export const MAX_CASE_COST_VND = 10_000_000_000;

/**
 * Lọc danh sách bệnh án của một con ngựa.
 */
export class MedicalCaseListQueryDto {
  @ApiPropertyOptional({ enum: MedicalCaseStatus })
  @IsOptional()
  @IsEnum(MedicalCaseStatus)
  status?: MedicalCaseStatus;
}

/**
 * Đóng bệnh án và chốt chi phí (F3.9).
 */
export class CloseMedicalCaseDto {
  @ApiProperty({ minLength: 1, maxLength: 4000 })
  @Transform(trimValue)
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  finalConclusion!: string;

  @ApiProperty({
    minimum: 0,
    maximum: MAX_CASE_COST_VND,
    description: 'Tổng chi phí điều trị, số nguyên VND',
  })
  @IsInt()
  @Min(0)
  @Max(MAX_CASE_COST_VND)
  totalCost!: number;

  @ApiPropertyOptional({
    enum: CaseLockDecision,
    description:
      'Bắt buộc khi lệnh khóa huấn luyện gắn với bệnh án còn hiệu lực',
  })
  @IsOptional()
  @IsEnum(CaseLockDecision)
  lockDecision?: CaseLockDecision;

  @ApiPropertyOptional({
    format: 'date-time',
    description: 'Ngày dự kiến gỡ khóa; bắt buộc khi lockDecision là KEEP',
  })
  @IsOptional()
  @IsDateString()
  lockExpectedEnd?: string;
}

/**
 * Điều chỉnh chi phí bệnh án đã đóng (F3.9 mục 8).
 */
export class AdjustCaseCostDto {
  @ApiProperty({ minimum: 0, maximum: MAX_CASE_COST_VND })
  @IsInt()
  @Min(0)
  @Max(MAX_CASE_COST_VND)
  totalCost!: number;

  @ApiProperty({ minLength: 1, maxLength: 500 })
  @Transform(trimValue)
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  reason!: string;
}

/**
 * Báo cáo tổng chi phí y tế theo khoảng ngày đóng bệnh án (F3.10 mục 4).
 */
export class MedicalCostReportQueryDto {
  @ApiProperty({
    format: 'date',
    description: 'Từ ngày (lịch câu lạc bộ), YYYY-MM-DD',
  })
  @Matches(DATE_ONLY_PATTERN, { message: 'from phải có dạng YYYY-MM-DD' })
  from!: string;

  @ApiProperty({
    format: 'date',
    description: 'Đến ngày (lịch câu lạc bộ), YYYY-MM-DD',
  })
  @Matches(DATE_ONLY_PATTERN, { message: 'to phải có dạng YYYY-MM-DD' })
  to!: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4')
  barnId?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Chủ ngựa hiện tại trên hồ sơ',
  })
  @IsOptional()
  @IsUUID('4')
  ownerId?: string;
}
