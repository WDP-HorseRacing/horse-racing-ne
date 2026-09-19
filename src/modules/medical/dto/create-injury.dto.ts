import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { InjuryBodyRegion, InjuryType } from '../constants/injury-marker.enum';

export class InjuryPositionDto {
  @ApiProperty()
  @IsNumber()
  x!: number;

  @ApiProperty()
  @IsNumber()
  y!: number;

  @ApiProperty()
  @IsNumber()
  z!: number;
}

export class CreateInjuryDto {
  @ApiProperty({ enum: InjuryBodyRegion })
  @IsEnum(InjuryBodyRegion)
  bodyRegion!: InjuryBodyRegion;

  @ApiPropertyOptional({
    type: InjuryPositionDto,
    description: 'Point on the 3D horse model, in model coordinates',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => InjuryPositionDto)
  position?: InjuryPositionDto;

  @ApiProperty({ enum: InjuryType })
  @IsEnum(InjuryType)
  injuryType!: InjuryType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}
