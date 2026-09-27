import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import {
  InjuryBodyRegion,
  InjuryType,
  RecoveryStatus,
} from '../constants/injury-marker.enum';

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

  @ApiProperty({
    enum: RecoveryStatus,
    description: 'Mức hồi phục tại buổi khám này (F3.6 mục 2)',
  })
  @IsEnum(RecoveryStatus)
  recoveryStatus!: RecoveryStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}
