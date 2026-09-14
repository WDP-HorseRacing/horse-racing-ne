import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsUUID } from 'class-validator';

export class CreateStableAssignmentDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  horseId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  groomId!: string;

  @ApiProperty({ format: 'date-time' })
  @IsDateString()
  startAt!: string;
}
