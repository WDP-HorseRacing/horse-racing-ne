import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, Matches } from 'class-validator';
import { DATE_ONLY_PATTERN } from '../../../common/utils/dto-input';

export class ReportPeriodDto {
  @ApiPropertyOptional({
    format: 'date',
    description:
      'Từ ngày (lịch câu lạc bộ), YYYY-MM-DD; bỏ trống là 29 ngày trước ngày kết thúc',
  })
  @IsOptional()
  @IsDateString({ strict: true })
  @Matches(DATE_ONLY_PATTERN, { message: 'Từ ngày phải có dạng YYYY-MM-DD' })
  from?: string;

  @ApiPropertyOptional({
    format: 'date',
    description:
      'Tới hết ngày (lịch câu lạc bộ), YYYY-MM-DD; bỏ trống là hôm nay',
  })
  @IsOptional()
  @IsDateString({ strict: true })
  @Matches(DATE_ONLY_PATTERN, { message: 'Đến ngày phải có dạng YYYY-MM-DD' })
  to?: string;
}
