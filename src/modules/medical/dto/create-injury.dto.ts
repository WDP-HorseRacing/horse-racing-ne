import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MinLength } from 'class-validator';

export class CreateInjuryDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  bodyRegion!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  injuryType!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}
