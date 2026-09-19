import { ApiProperty, PartialType } from '@nestjs/swagger';
import { Expose } from 'class-transformer';
import { IsEnum, IsNumber, IsString, Min, MinLength } from 'class-validator';
import { SupplyCategory } from '../enums/supply-category.enum';

export class CreateSupplyItemDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  name!: string;

  @ApiProperty({ enum: SupplyCategory })
  @IsEnum(SupplyCategory)
  category!: SupplyCategory;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  unit!: string;

  @ApiProperty({ minimum: 0 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  quantityOnHand!: number;

  @ApiProperty({ minimum: 0 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  reorderThreshold!: number;
}

export class UpdateSupplyItemDto extends PartialType(CreateSupplyItemDto) {}

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
  @ApiProperty({ type: String, description: 'Current quantity in stock' })
  quantityOnHand!: string;

  @Expose()
  @ApiProperty({ type: String, description: 'Low-stock reorder threshold' })
  reorderThreshold!: string;

  @Expose()
  @ApiProperty({ format: 'date-time' })
  createdAt!: Date;

  @Expose()
  @ApiProperty({ format: 'date-time' })
  updatedAt!: Date;
}
