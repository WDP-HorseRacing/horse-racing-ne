import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsNumber, Min } from 'class-validator';

export class RecordResultDto {
  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  placing!: number;

  @ApiProperty({ minimum: 0 })
  @IsNumber()
  @Min(0)
  timeSeconds!: number;
}
