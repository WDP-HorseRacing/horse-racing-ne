import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsString, Min, MinLength } from 'class-validator';

export class CreateSupplyItemDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  name!: string;

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
