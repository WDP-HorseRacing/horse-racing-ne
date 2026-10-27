import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional } from 'class-validator';
import { toQueryBoolean } from '../../../common/utils/query-boolean';

export class InjuryListQueryDto {
  @ApiPropertyOptional({
    description: 'true: chỉ lấy chấn thương chưa lành. Mặc định lấy tất cả',
  })
  @IsOptional()
  @Transform(toQueryBoolean)
  @IsBoolean()
  unhealedOnly?: boolean;
}
