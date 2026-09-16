import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import {
  HorseHealthStatus,
  HorseLifecycleStatus,
} from '../constants/horse-status.enum';

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

  @ApiPropertyOptional({
    default: false,
    description: 'true để xem ngựa tham chiếu (chỉ Club Manager, Head Trainer)',
  })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  reference: boolean = false;
}
