import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose, Transform, Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { trimValue } from '../../../common/utils/dto-input';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { PaginationMetaDto } from '../../../common/dto/pagination-response.dto';
import { SupplyCategory } from '../enums/supply-category.enum';
import { SupplyStockMovementType } from '../enums/supply-stock-movement-type.enum';

const MAX_QUANTITY = 1_000_000_000;
export const MAX_UNIT_PRICE_VND = 1_000_000_000;

export class CreateSupplyItemDto {
  @ApiProperty({
    maxLength: 160,
    description: 'Tên vật tư, duy nhất trong CLB',
  })
  @Transform(trimValue)
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  name!: string;

  @ApiProperty({ enum: SupplyCategory, description: 'Loại vật tư' })
  @IsEnum(SupplyCategory)
  category!: SupplyCategory;

  @ApiProperty({ maxLength: 32, description: 'Đơn vị, vd kg, cuộn' })
  @Transform(trimValue)
  @IsString()
  @MinLength(1)
  @MaxLength(32)
  unit!: string;

  @ApiPropertyOptional({
    minimum: 0,
    maximum: MAX_QUANTITY,
    default: 0,
    description: 'Số tồn ban đầu; khác 0 thì tạo lô đầu tiên',
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(MAX_QUANTITY)
  quantityOnHand?: number;

  @ApiPropertyOptional({
    minimum: 0,
    maximum: MAX_UNIT_PRICE_VND,
    default: 0,
    description: 'Đơn giá (VND) của lô tồn ban đầu; bỏ trống là 0',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_UNIT_PRICE_VND)
  openingUnitPrice?: number;

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
  @Transform(trimValue)
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
  @Transform(trimValue)
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

export class SupplyReceiptDto {
  @ApiProperty({
    minimum: 0.01,
    maximum: MAX_QUANTITY,
    description: 'Số lượng nhập kho',
  })
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  @Max(MAX_QUANTITY)
  quantity!: number;

  @ApiProperty({
    minimum: 0,
    maximum: MAX_UNIT_PRICE_VND,
    description: 'Đơn giá (VND) thực trả cho một đơn vị của lần nhập này',
  })
  @IsInt()
  @Min(0)
  @Max(MAX_UNIT_PRICE_VND)
  unitPrice!: number;

  @ApiPropertyOptional({ maxLength: 500, description: 'Ghi chú lần nhập' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class SupplyUsageDto {
  @ApiProperty({
    minimum: 0.01,
    maximum: MAX_QUANTITY,
    description: 'Số lượng lấy ra dùng',
  })
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  @Max(MAX_QUANTITY)
  quantity!: number;

  @ApiPropertyOptional({ maxLength: 500, description: 'Ghi chú lần lấy' })
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
  @ApiProperty({ type: Number, description: 'Số tồn hiện tại' })
  quantityOnHand!: number;

  @Expose()
  @ApiProperty({ type: Number, description: 'Ngưỡng báo thiếu' })
  reorderThreshold!: number;

  @Expose()
  @ApiProperty({ description: 'Số tồn nhỏ hơn hoặc bằng ngưỡng báo thiếu' })
  lowStock!: boolean;

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
  @ApiProperty({ type: Number, description: 'Chênh lệch, âm là giảm' })
  delta!: number;

  @Expose()
  @ApiProperty({ type: Number, description: 'Số tồn sau lần đổi' })
  balanceAfter!: number;

  @Expose()
  @ApiProperty({ enum: SupplyStockMovementType })
  type!: SupplyStockMovementType;

  @Expose()
  @ApiProperty({
    format: 'uuid',
    nullable: true,
    type: String,
    description: 'Lô của dòng sổ; null với dòng ghi trước khi có lô',
  })
  lotId!: string | null;

  @Expose()
  @ApiProperty({
    type: Number,
    nullable: true,
    description: 'Đơn giá (VND) của lô; null với dòng ghi trước khi có lô',
  })
  unitPrice!: number | null;

  @Expose()
  @ApiProperty({
    type: Number,
    nullable: true,
    description:
      'Tiền của dòng sổ (VND) = chênh lệch × đơn giá lô, âm là xuất; null với dòng ghi trước khi có lô',
  })
  amount!: number | null;

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

export class SupplyLotResponseDto {
  @Expose()
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @Expose()
  @ApiProperty({ type: Number, description: 'Số lượng nhập của lô' })
  quantity!: number;

  @Expose()
  @ApiProperty({ type: Number, description: 'Số còn lại trong lô' })
  remaining!: number;

  @Expose()
  @ApiProperty({ type: Number, description: 'Đơn giá (VND) của lô' })
  unitPrice!: number;

  @Expose()
  @ApiProperty({ format: 'date-time', description: 'Thời điểm nhập lô' })
  createdAt!: Date;
}
