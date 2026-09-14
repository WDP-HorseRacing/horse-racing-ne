import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsString, MinLength } from 'class-validator';

export class CreateTrainingPlanDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  phaseName!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  goal!: string;

  @ApiProperty({ format: 'date' })
  @IsDateString()
  startDate!: string;

  @ApiProperty({ format: 'date' })
  @IsDateString()
  endDate!: string;
}
