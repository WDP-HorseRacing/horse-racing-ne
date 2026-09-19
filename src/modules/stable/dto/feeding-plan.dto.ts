import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsObject, IsOptional } from 'class-validator';

export class CreateFeedingPlanDto {
  @ApiProperty({
    format: 'date',
    description: 'Ngày bắt đầu áp dụng kế hoạch dinh dưỡng',
  })
  @IsDateString()
  effectiveFrom!: string;

  @ApiPropertyOptional({
    format: 'date',
    description: 'Ngày kết thúc (nếu có)',
  })
  @IsOptional()
  @IsDateString()
  effectiveTo?: string;

  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    description: 'Khẩu phần ăn (cám, cỏ, vitamin, khoáng chất...)',
  })
  @IsObject()
  ration!: Record<string, unknown>;
}
