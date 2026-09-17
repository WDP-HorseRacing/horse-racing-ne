import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNumber, IsString, Min, MinLength } from 'class-validator';
import { SupplyCategory } from '../constants/supply-category.enum';

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
  @IsNumber()
  @Min(0)
  quantityOnHand!: number;

  @ApiProperty({ minimum: 0 })
  @IsNumber()
  @Min(0)
  reorderThreshold!: number;
}
