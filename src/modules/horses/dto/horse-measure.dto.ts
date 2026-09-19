import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsNumber, IsOptional } from 'class-validator';
import { HorseMeasurementType } from '../constants/horse-measurement-type.enum';

export class CreateHorseMeasurementDto {
  @ApiProperty({ enum: HorseMeasurementType })
  @IsEnum(HorseMeasurementType)
  type!: HorseMeasurementType;

  @ApiProperty({
    description:
      'Đơn vị cố định theo loại: WEIGHT kg (30–1500), HEIGHT cm (50–250), BODY_CONDITION điểm (1–9), TEMPERATURE °C (30–45)',
  })
  @IsNumber({ maxDecimalPlaces: 2 })
  value!: number;

  @ApiPropertyOptional({
    format: 'date-time',
    description: 'Mặc định là thời điểm hiện tại',
  })
  @IsOptional()
  @IsDateString()
  measuredAt?: string;
}

export class HorseMeasurementListQueryDto {
  @ApiPropertyOptional({ enum: HorseMeasurementType })
  @IsOptional()
  @IsEnum(HorseMeasurementType)
  type?: HorseMeasurementType;
}

export class HorseLatestMeasurementDto {
  @ApiProperty({ enum: HorseMeasurementType })
  type!: HorseMeasurementType;

  @ApiProperty({ example: '512.50' })
  value!: string;

  @ApiProperty({ example: 'kg' })
  unit!: string;

  @ApiProperty({ format: 'date-time' })
  measuredAt!: Date;
}

export class HorseMeasurementResponseDto extends HorseLatestMeasurementDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  horseId!: string;

  @ApiProperty({ format: 'uuid' })
  measuredBy!: string;

  @ApiProperty()
  measuredByName!: string;
}
