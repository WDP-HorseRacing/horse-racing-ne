import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsObject, IsOptional } from 'class-validator';

export class CreateFeedingPlanDto {
  @ApiProperty({ format: 'date' })
  @IsDateString()
  effectiveFrom!: string;

  @ApiPropertyOptional({ format: 'date' })
  @IsOptional()
  @IsDateString()
  effectiveTo?: string;

  @ApiProperty({ type: 'object', additionalProperties: true })
  @IsObject()
  ration!: Record<string, unknown>;
}
