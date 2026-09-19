import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsObject, IsUUID } from 'class-validator';

export class CreateChecklistDto {
  @ApiProperty({ format: 'uuid', description: 'ID groom được giao checklist' })
  @IsUUID()
  groomId!: string;

  @ApiProperty({ format: 'date', description: 'Ngày kiểm tra' })
  @IsDateString()
  checklistDate!: string;

  @ApiProperty({
    type: 'object',
    additionalProperties: { type: 'boolean' },
    description: 'Các hạng mục kiểm tra sức khỏe, vệ sinh và trạng thái hoàn thành',
  })
  @IsObject()
  items!: Record<string, boolean>;
}
