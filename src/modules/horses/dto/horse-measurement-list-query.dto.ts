import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { HorseMeasurementType } from '../constants/horse-measurement-type.enum';

export class HorseMeasurementListQueryDto {
  @ApiPropertyOptional({ enum: HorseMeasurementType })
  @IsOptional()
  @IsEnum(HorseMeasurementType)
  type?: HorseMeasurementType;
}
