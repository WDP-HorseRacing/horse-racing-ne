import { ApiProperty } from '@nestjs/swagger';
import { HorseMeasurementType } from '../constants/horse-measurement-type.enum';

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
