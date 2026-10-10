import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsEnum,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { SupplyCategory } from '../../supplies/enums/supply-category.enum';
import { FeedingMeal } from '../constants/feeding-meal.enum';
import { FeedingPlanStatus } from '../constants/feeding-plan-status.enum';

const MAX_ITEMS = 50;
const MAX_HORSES = 50;
const MAX_QUANTITY = 1_000_000;

export class FeedingPlanItemInputDto {
  @ApiProperty({ enum: FeedingMeal, description: 'Bữa' })
  @IsEnum(FeedingMeal)
  meal!: FeedingMeal;

  @ApiProperty({
    format: 'uuid',
    description: 'Vật tư loại FEED hoặc SUPPLEMENT',
  })
  @IsUUID()
  supplyItemId!: string;

  @ApiProperty({
    minimum: 0.01,
    maximum: MAX_QUANTITY,
    description: 'Lượng, theo đơn vị của vật tư',
  })
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  @Max(MAX_QUANTITY)
  quantity!: number;

  @ApiPropertyOptional({ maxLength: 200, description: 'Ghi chú cho dòng' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  note?: string;
}

export class CreateFeedingPlansDto {
  @ApiProperty({
    type: [String],
    format: 'uuid',
    minItems: 1,
    maxItems: MAX_HORSES,
    description: 'Các ngựa cần lập khẩu phần; mỗi ngựa một bản nháp riêng',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_HORSES)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  horseIds!: string[];

  @ApiPropertyOptional({
    type: [FeedingPlanItemInputDto],
    maxItems: MAX_ITEMS,
    description:
      'Các dòng khẩu phần; gửi đúng một trong items hoặc copyFromPlanId',
  })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_ITEMS)
  @ValidateNested({ each: true })
  @Type(() => FeedingPlanItemInputDto)
  items?: FeedingPlanItemInputDto[];

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Lấy dòng từ khẩu phần có sẵn thay cho items',
  })
  @IsOptional()
  @IsUUID()
  copyFromPlanId?: string;

  @ApiPropertyOptional({ maxLength: 500, description: 'Ghi chú khẩu phần' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class ReplaceFeedingPlanDto {
  @ApiProperty({
    type: [FeedingPlanItemInputDto],
    minItems: 1,
    maxItems: MAX_ITEMS,
    description: 'Toàn bộ dòng khẩu phần mới',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_ITEMS)
  @ValidateNested({ each: true })
  @Type(() => FeedingPlanItemInputDto)
  items!: FeedingPlanItemInputDto[];

  @ApiPropertyOptional({
    maxLength: 500,
    nullable: true,
    description: 'Ghi chú khẩu phần; gửi null để xóa',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string | null;
}

export class FeedingPlanListQueryDto {
  @ApiPropertyOptional({
    enum: FeedingPlanStatus,
    description: 'Lọc theo trạng thái; Groom luôn chỉ nhận bản ACTIVE',
  })
  @IsOptional()
  @IsEnum(FeedingPlanStatus)
  status?: FeedingPlanStatus;
}

export class FeedingUserSummaryResponseDto {
  @Expose()
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @Expose()
  @ApiProperty()
  fullName!: string;
}

export class FeedingPlanItemResponseDto {
  @Expose()
  @ApiProperty({ format: 'uuid' })
  supplyItemId!: string;

  @Expose()
  @ApiProperty({ description: 'Tên vật tư' })
  name!: string;

  @Expose()
  @ApiProperty({ enum: SupplyCategory })
  category!: SupplyCategory;

  @Expose()
  @ApiProperty({ description: 'Đơn vị của vật tư' })
  unit!: string;

  @Expose()
  @ApiProperty({ type: String, description: 'Lượng' })
  quantity!: string;

  @Expose()
  @ApiPropertyOptional({ nullable: true, type: String })
  note!: string | null;
}

export class FeedingMealResponseDto {
  @Expose()
  @ApiProperty({ enum: FeedingMeal })
  meal!: FeedingMeal;

  @Expose()
  @Type(() => FeedingPlanItemResponseDto)
  @ApiProperty({ type: [FeedingPlanItemResponseDto] })
  items!: FeedingPlanItemResponseDto[];
}

export class FeedingPlanResponseDto {
  @Expose()
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @Expose()
  @ApiProperty({ format: 'uuid' })
  horseId!: string;

  @Expose()
  @ApiProperty({ description: 'Tên ngựa' })
  horseName!: string;

  @Expose()
  @ApiProperty({ enum: FeedingPlanStatus })
  status!: FeedingPlanStatus;

  @Expose()
  @ApiPropertyOptional({ nullable: true, type: String })
  note!: string | null;

  @Expose()
  @Type(() => FeedingUserSummaryResponseDto)
  @ApiProperty({
    type: FeedingUserSummaryResponseDto,
    description: 'Người lập',
  })
  creator!: FeedingUserSummaryResponseDto;

  @Expose()
  @Type(() => FeedingUserSummaryResponseDto)
  @ApiPropertyOptional({
    type: FeedingUserSummaryResponseDto,
    nullable: true,
    description: 'Người duyệt',
  })
  approver!: FeedingUserSummaryResponseDto | null;

  @Expose()
  @ApiPropertyOptional({
    format: 'date-time',
    nullable: true,
    description: 'Thời điểm bắt đầu áp dụng',
  })
  approvedAt!: Date | null;

  @Expose()
  @ApiPropertyOptional({
    format: 'date-time',
    nullable: true,
    description: 'Thời điểm hết hiệu lực',
  })
  archivedAt!: Date | null;

  @Expose()
  @Type(() => FeedingMealResponseDto)
  @ApiProperty({
    type: [FeedingMealResponseDto],
    description: 'Các bữa có dòng, theo thứ tự trong ngày',
  })
  meals!: FeedingMealResponseDto[];

  @Expose()
  @ApiProperty({ format: 'date-time' })
  createdAt!: Date;

  @Expose()
  @ApiProperty({ format: 'date-time' })
  updatedAt!: Date;
}
