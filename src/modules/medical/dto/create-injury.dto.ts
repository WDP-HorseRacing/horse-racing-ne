import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDefined,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
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

  @ApiProperty({
    type: InjuryPositionDto,
    description: 'Điểm trên mô hình 3D của ngựa, theo tọa độ của mô hình',
  })
  @IsDefined()
  @ValidateNested()
  @Type(() => InjuryPositionDto)
  position!: InjuryPositionDto;

  @ApiProperty({ enum: InjuryType })
  @IsEnum(InjuryType)
  injuryType!: InjuryType;

  @ApiProperty({
    enum: RecoveryStatus,
    description: 'Mức hồi phục tại buổi khám này',
  })
  @IsEnum(RecoveryStatus)
  recoveryStatus!: RecoveryStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateInjuryStatusDto {
  @ApiProperty({
    format: 'uuid',
    description: 'Chấn thương chưa lành của chính con ngựa',
  })
  @IsUUID('4')
  injuryId!: string;

  @ApiProperty({
    enum: RecoveryStatus,
    description: 'Mức hồi phục tại buổi khám này',
  })
  @IsEnum(RecoveryStatus)
  recoveryStatus!: RecoveryStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}
