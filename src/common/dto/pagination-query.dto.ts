import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { SortOrder } from '../enums/sort-order.enum';

export class PaginationQueryDto {
  @ApiPropertyOptional({
    default: 1,
    minimum: 1,
    description: 'Trang hiện tại',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({
    default: 20,
    minimum: 1,
    maximum: 100,
    description: 'Số lượng phần tử mỗi trang',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 20;

  @ApiPropertyOptional({ description: 'Trường cần sắp xếp' })
  @IsOptional()
  @IsString()
  sortBy?: string;

  @ApiPropertyOptional({
    enum: SortOrder,
    default: SortOrder.DESC,
    description: 'Chiều sắp xếp',
  })
  @IsOptional()
  @IsEnum(SortOrder)
  sortOrder: SortOrder = SortOrder.DESC;

  get skip(): number {
    return (this.page - 1) * this.limit;
  }
}
