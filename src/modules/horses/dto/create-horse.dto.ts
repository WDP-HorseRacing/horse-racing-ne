import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { HorseGender } from '../constants/horse-gender.enum';
import { RaceAptitude } from '../constants/race-aptitude.enum';

export class CreateHorseDto {
  @ApiProperty({ maxLength: 160 })
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  name!: string;

  @ApiProperty({ enum: HorseGender })
  @IsEnum(HorseGender)
  gender!: HorseGender;

  @ApiPropertyOptional({ maxLength: 80, nullable: true, type: String })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  breed?: string | null;

  @ApiPropertyOptional({ maxLength: 40, nullable: true, type: String })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  color?: string | null;

  @ApiPropertyOptional({ enum: RaceAptitude, nullable: true })
  @IsOptional()
  @IsEnum(RaceAptitude)
  raceAptitude?: RaceAptitude | null;

  @ApiPropertyOptional({ maxLength: 80, nullable: true, type: String })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  microchipId?: string | null;

  @ApiPropertyOptional({ format: 'date', nullable: true, type: String })
  @IsOptional()
  @IsDateString()
  dateOfBirth?: string | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true, type: String })
  @IsOptional()
  @IsUUID()
  sireId?: string | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true, type: String })
  @IsOptional()
  @IsUUID()
  damId?: string | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true, type: String })
  @IsOptional()
  @IsUUID()
  mediaId?: string | null;

  @ApiPropertyOptional({
    default: false,
    description:
      'true cho ngựa giống bên ngoài, chỉ dùng làm tổ tiên trong phả hệ',
  })
  @IsOptional()
  @IsBoolean()
  isReference?: boolean;
}
