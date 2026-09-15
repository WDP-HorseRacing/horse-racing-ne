import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { InjuryBodyRegion, InjuryType } from '../constants/injury-marker.enum';

export class CreateInjuryDto {
  @ApiProperty({ enum: InjuryBodyRegion })
  @IsEnum(InjuryBodyRegion)
  bodyRegion!: InjuryBodyRegion;

  @ApiProperty({ enum: InjuryType })
  @IsEnum(InjuryType)
  injuryType!: InjuryType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}
