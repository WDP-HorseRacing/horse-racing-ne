import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import {
  CaseLockDecision,
  MedicalCaseStatus,
} from '../constants/medical-case.enum';
import {
  IsDateOnly,
  IsIsoInstant,
  trimValue,
} from '../../../common/utils/dto-input';

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
 * Đóng bệnh án và chốt kết luận cuối.
 */
export class CloseMedicalCaseDto {
  @ApiProperty({ minLength: 1, maxLength: 4000 })
  @Transform(trimValue)
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  finalConclusion!: string;

  @ApiPropertyOptional({
    enum: CaseLockDecision,
    description:
      'Bắt buộc khi ngựa còn lệnh khóa huấn luyện đang hiệu lực, kể cả lệnh giữ lại từ bệnh án trước',
  })
  @IsOptional()
  @IsEnum(CaseLockDecision)
  lockDecision?: CaseLockDecision;

  @ApiPropertyOptional({
    format: 'date-time',
    example: '2026-10-23T00:30:00+07:00',
    description: 'Ngày dự kiến gỡ khóa; bắt buộc khi lockDecision là KEEP',
  })
  @IsOptional()
  @IsIsoInstant()
  lockExpectedEnd?: string;

  @ApiPropertyOptional({
    description:
      'true thì đóng bệnh án và ghi nhận ngựa mất cùng lúc, lấy kết luận cuối làm lý do, ngày mất là ngày ghi nhận theo lịch câu lạc bộ; không gửi kèm lockDecision, lockExpectedEnd',
  })
  @IsOptional()
  @IsBoolean()
  deceased?: boolean;
}

/**
 * Đính chính kết luận cuối của bệnh án đã đóng, bắt buộc lý do.
 */
export class CorrectCaseConclusionDto {
  @ApiProperty({ minLength: 1, maxLength: 4000 })
  @Transform(trimValue)
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  finalConclusion!: string;

  @ApiProperty({ minLength: 1, maxLength: 500 })
  @Transform(trimValue)
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  reason!: string;
}

/**
 * Báo cáo tổng chi phí y tế theo khoảng ngày khám.
 */
export class MedicalCostReportQueryDto {
  @ApiProperty({
    format: 'date',
    description: 'Từ ngày (lịch câu lạc bộ), YYYY-MM-DD',
  })
  @IsDateOnly({ message: 'Từ ngày phải có dạng YYYY-MM-DD' })
  from!: string;

  @ApiProperty({
    format: 'date',
    description: 'Đến ngày (lịch câu lạc bộ), YYYY-MM-DD',
  })
  @IsDateOnly({ message: 'Đến ngày phải có dạng YYYY-MM-DD' })
  to!: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Khu của ngựa lúc khám',
  })
  @IsOptional()
  @IsUUID('4')
  barnId?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Chủ của giai đoạn sở hữu chứa ngày khám',
  })
  @IsOptional()
  @IsUUID('4')
  ownerId?: string;
}
