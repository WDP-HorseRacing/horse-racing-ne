import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsObject, IsUUID } from 'class-validator';

export class CreateChecklistDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  groomId!: string;

  @ApiProperty({ format: 'date' })
  @IsDateString()
  checklistDate!: string;

  @ApiProperty({ type: 'object', additionalProperties: { type: 'boolean' } })
  @IsObject()
  items!: Record<string, boolean>;
}
