import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';
import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { PaginationMetaDto } from '../../../common/dto/pagination-response.dto';
import { SupplyCategory } from '../enums/supply-category.enum';
import { SupplyStockMovementType } from '../enums/supply-stock-movement-type.enum';

const MAX_QUANTITY = 1_000_000_000;

export class CreateSupplyItemDto {
  @ApiProperty({
    maxLength: 160,
    description: 'Tên vật tư, duy nhất trong CLB',
  })
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  name!: string;

  @ApiProperty({ enum: SupplyCategory, description: 'Loại vật tư' })
  @IsEnum(SupplyCategory)
  category!: SupplyCategory;

  @ApiProperty({ maxLength: 32, description: 'Đơn vị, vd kg, cuộn' })
  @IsString()
  @MinLength(1)
  @MaxLength(32)
  unit!: string;

  @ApiPropertyOptional({
    minimum: 0,
    maximum: MAX_QUANTITY,
    default: 0,
    description: 'Số tồn ban đầu; khác 0 thì ghi một dòng sổ kiểm kê',
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(MAX_QUANTITY)
  quantityOnHand?: number;

  @ApiProperty({
    minimum: 0,
    maximum: MAX_QUANTITY,
    description: 'Ngưỡng báo thiếu',
  })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(MAX_QUANTITY)
  reorderThreshold!: number;
}

export class UpdateSupplyItemDto {
  @ApiPropertyOptional({
    maxLength: 160,
    description: 'Tên vật tư, duy nhất trong CLB',
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  name?: string;

  @ApiPropertyOptional({ enum: SupplyCategory, description: 'Loại vật tư' })
  @IsOptional()
  @IsEnum(SupplyCategory)
  category?: SupplyCategory;

  @ApiPropertyOptional({ maxLength: 32, description: 'Đơn vị, vd kg, cuộn' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(32)
  unit?: string;

  @ApiPropertyOptional({
    minimum: 0,
    maximum: MAX_QUANTITY,
    description: 'Ngưỡng báo thiếu',
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(MAX_QUANTITY)
  reorderThreshold?: number;
}

export class SupplyStockCountDto {
  @ApiProperty({
    minimum: 0,
    maximum: MAX_QUANTITY,
    description: 'Số đếm thực tế',
  })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(MAX_QUANTITY)
  quantityOnHand!: number;

  @ApiPropertyOptional({ maxLength: 500, description: 'Ghi chú kiểm kê' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class SupplyItemListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: SupplyCategory, description: 'Lọc theo loại' })
  @IsOptional()
  @IsEnum(SupplyCategory)
  category?: SupplyCategory;

  @ApiPropertyOptional({ maxLength: 160, description: 'Tìm theo tên' })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  search?: string;
}

export class SupplyUserSummaryResponseDto {
  @Expose()
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @Expose()
  @ApiProperty()
  fullName!: string;

  @Expose()
  @ApiProperty({ format: 'email' })
  email!: string;
}

export class SupplyItemResponseDto {
  @Expose()
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @Expose()
  @ApiProperty()
  name!: string;

  @Expose()
  @ApiProperty({ enum: SupplyCategory })
  category!: SupplyCategory;

  @Expose()
  @ApiProperty()
  unit!: string;

  @Expose()
  @ApiProperty({ type: String, description: 'Số tồn hiện tại' })
  quantityOnHand!: string;

  @Expose()
  @ApiProperty({ type: String, description: 'Ngưỡng báo thiếu' })
  reorderThreshold!: string;

  @Expose()
  @ApiProperty({ description: 'Số tồn nhỏ hơn hoặc bằng ngưỡng báo thiếu' })
  lowStock!: boolean;

  @Expose()
  @ApiPropertyOptional({
    format: 'date-time',
    nullable: true,
    description: 'Lần kiểm kê gần nhất',
  })
  lastCountedAt!: Date | null;

  @Expose()
  @Type(() => SupplyUserSummaryResponseDto)
  @ApiPropertyOptional({
    type: SupplyUserSummaryResponseDto,
    nullable: true,
    description: 'Người kiểm kê gần nhất',
  })
  lastCounter!: SupplyUserSummaryResponseDto | null;

  @Expose()
  @ApiPropertyOptional({
    format: 'date-time',
    nullable: true,
    description: 'Thời điểm xóa; null nếu vật tư còn dùng',
  })
  deletedAt!: Date | null;

  @Expose()
  @ApiProperty({ format: 'date-time' })
  createdAt!: Date;

  @Expose()
  @ApiProperty({ format: 'date-time' })
  updatedAt!: Date;
}

export class SupplyItemPageResponseDto {
  @ApiProperty({ type: [SupplyItemResponseDto] })
  items!: SupplyItemResponseDto[];

  @ApiProperty({ type: PaginationMetaDto })
  @Type(() => PaginationMetaDto)
  meta!: PaginationMetaDto;
}

export class SupplyStockMovementResponseDto {
  @Expose()
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @Expose()
  @ApiProperty({ format: 'uuid' })
  itemId!: string;

  @Expose()
  @ApiProperty({ type: String, description: 'Chênh lệch, âm là giảm' })
  delta!: string;

  @Expose()
  @ApiProperty({ type: String, description: 'Số tồn sau lần đổi' })
  balanceAfter!: string;

  @Expose()
  @ApiProperty({ enum: SupplyStockMovementType })
  type!: SupplyStockMovementType;

  @Expose()
  @ApiPropertyOptional({
    format: 'uuid',
    nullable: true,
    type: String,
    description: 'Đề xuất được cấp, với RESTOCK',
  })
  requestId!: string | null;

  @Expose()
  @ApiPropertyOptional({ nullable: true })
  note!: string | null;

  @Expose()
  @Type(() => SupplyUserSummaryResponseDto)
  @ApiProperty({ type: SupplyUserSummaryResponseDto })
  creator!: SupplyUserSummaryResponseDto;

  @Expose()
  @ApiProperty({ format: 'date-time' })
  createdAt!: Date;
}

export class SupplyStockMovementPageResponseDto {
  @ApiProperty({ type: [SupplyStockMovementResponseDto] })
  items!: SupplyStockMovementResponseDto[];

  @ApiProperty({ type: PaginationMetaDto })
  @Type(() => PaginationMetaDto)
  meta!: PaginationMetaDto;
}
