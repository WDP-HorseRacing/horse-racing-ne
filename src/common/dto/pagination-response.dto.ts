import { ApiProperty } from '@nestjs/swagger';

export class PaginationMetaDto {
  @ApiProperty({ description: 'Tổng số phần tử' })
  total!: number;

  @ApiProperty({ description: 'Trang hiện tại' })
  page!: number;

  @ApiProperty({ description: 'Số phần tử mỗi trang' })
  limit!: number;

  @ApiProperty({ description: 'Tổng số trang' })
  totalPages!: number;
}

export class PaginationResponseDto<T> {
  @ApiProperty({ isArray: true })
  items!: T[];

  @ApiProperty({ type: PaginationMetaDto })
  meta!: PaginationMetaDto;

  constructor(items: T[], total: number, page: number, limit: number) {
    this.items = items;
    this.meta = {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    };
  }
}
