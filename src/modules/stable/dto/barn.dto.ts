import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Expose } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { BarnStatus } from '../constants/barn-status.enum';

export class CreateBarnDto {
  @ApiProperty({ maxLength: 80 })
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name!: string;

  @ApiPropertyOptional({ description: 'Mô tả khu chuồng' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'Sức chứa tối đa (số ô chuồng)' })
  @IsOptional()
  @IsInt()
  @Min(1)
  capacity?: number;

  @ApiPropertyOptional({ enum: BarnStatus, default: BarnStatus.ACTIVE })
  @IsOptional()
  @IsEnum(BarnStatus)
  status?: BarnStatus;
}

export class UpdateBarnDto extends PartialType(CreateBarnDto) {
  @ApiPropertyOptional({
    format: 'uuid',
    nullable: true,
    type: String,
    description: 'Head Trainer in charge; null clears the assignment',
  })
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsUUID()
  headTrainerId?: string | null;
}

export class BarnResponseDto {
  @Expose()
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @Expose()
  @ApiProperty()
  name!: string;

  @Expose()
  @ApiPropertyOptional({ nullable: true, type: String })
  description!: string | null;

  @Expose()
  @ApiPropertyOptional({ nullable: true, type: Number })
  capacity!: number | null;

  @Expose()
  @ApiProperty({ enum: BarnStatus })
  status!: BarnStatus;

  @Expose()
  @ApiPropertyOptional({ format: 'uuid', nullable: true, type: String })
  headTrainerId!: string | null;
}
