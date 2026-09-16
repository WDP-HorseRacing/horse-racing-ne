import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class PrescriptionResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  medicine!: string;

  @ApiProperty()
  dosage!: string;

  @ApiProperty()
  frequency!: string;

  @ApiProperty({ format: 'date' })
  startDate!: string;

  @ApiPropertyOptional({ format: 'date', nullable: true })
  endDate!: string | null;
}
