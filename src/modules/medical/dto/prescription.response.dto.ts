import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class PrescriptionResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  medicine!: string;

  @ApiPropertyOptional({
    description: 'Không có key khi caller là Horse Owner',
  })
  dosage?: string;

  @ApiPropertyOptional({
    description: 'Không có key khi caller là Horse Owner',
  })
  frequency?: string;

  @ApiProperty({ format: 'date' })
  startDate!: string;

  @ApiPropertyOptional({ format: 'date', nullable: true })
  endDate!: string | null;
}
