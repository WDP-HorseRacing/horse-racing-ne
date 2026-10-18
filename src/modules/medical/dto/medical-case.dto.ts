import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import {
  CaseLockDecision,
  MedicalCaseStatus,
} from '../constants/medical-case.enum';
import { DATE_ONLY_PATTERN, trimValue } from '../../../common/utils/dto-input';

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

  @ApiPropertyOptional({
    format: 'date',
    type: String,
    description:
      'Ngày mất (YYYY-MM-DD). Có giá trị thì đóng bệnh án và ghi nhận ngựa mất cùng lúc, lấy kết luận cuối làm lý do; không gửi kèm lockDecision, lockExpectedEnd. Không ở tương lai, không trước ngày sinh',
  })
  @IsOptional()
  @Matches(DATE_ONLY_PATTERN, {
    message: 'Ngày mất phải có dạng YYYY-MM-DD',
  })
  @IsDateString({ strict: true })
  dateOfDeath?: string;
}

/**
 * Báo cáo tổng chi phí y tế theo khoảng ngày khám.
 */
export class MedicalCostReportQueryDto {
  @ApiProperty({
    format: 'date',
    description: 'Từ ngày (lịch câu lạc bộ), YYYY-MM-DD',
  })
  @Matches(DATE_ONLY_PATTERN, { message: 'Từ ngày phải có dạng YYYY-MM-DD' })
  from!: string;

  @ApiProperty({
    format: 'date',
    description: 'Đến ngày (lịch câu lạc bộ), YYYY-MM-DD',
  })
  @Matches(DATE_ONLY_PATTERN, { message: 'Đến ngày phải có dạng YYYY-MM-DD' })
  to!: string;

  @ApiPropertyOptional({ format: 'uuid' })
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
