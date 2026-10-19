import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional } from 'class-validator';
import { IsDateOnly } from '../../../common/utils/dto-input';

export class ReportPeriodDto {
  @ApiPropertyOptional({
    format: 'date',
    description:
      'Từ ngày (lịch câu lạc bộ), YYYY-MM-DD; bỏ trống là 29 ngày trước ngày kết thúc',
  })
  @IsOptional()
  @IsDateOnly({ message: 'Từ ngày phải có dạng YYYY-MM-DD' })
  from?: string;

  @ApiPropertyOptional({
    format: 'date',
    description:
      'Tới hết ngày (lịch câu lạc bộ), YYYY-MM-DD; bỏ trống là hôm nay',
  })
  @IsOptional()
  @IsDateOnly({ message: 'Đến ngày phải có dạng YYYY-MM-DD' })
  to?: string;
}
