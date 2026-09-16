import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class HorseOwnershipResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  horseId!: string;

  @ApiProperty({ format: 'uuid' })
  ownerId!: string;

  @ApiProperty()
  ownerName!: string;

  @ApiProperty()
  percentage!: string;

  @ApiProperty({ format: 'date' })
  startDate!: string;

  @ApiPropertyOptional({ format: 'date', nullable: true })
  endDate!: string | null;
}
