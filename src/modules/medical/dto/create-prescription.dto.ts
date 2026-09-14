import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsString, MinLength } from 'class-validator';

export class CreatePrescriptionDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  medicine!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  dosage!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  frequency!: string;

  @ApiProperty({ format: 'date' })
  @IsDateString()
  startDate!: string;

  @ApiProperty({ format: 'date' })
  @IsDateString()
  endDate!: string;
}
