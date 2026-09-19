import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';
import { IsUUID } from 'class-validator';
import { AssignedGroomSummaryDto } from './stall.dto';

export class AssignGroomDto {
  @ApiProperty({ format: 'uuid', description: 'ID groom phụ trách' })
  @IsUUID()
  groomId!: string;
}

export class GroomAssignmentResponseDto {
  @Expose()
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @Expose()
  @ApiProperty({ format: 'uuid' })
  horseId!: string;

  @Expose()
  @ApiProperty({ format: 'uuid' })
  groomId!: string;

  @Expose()
  @Type(() => AssignedGroomSummaryDto)
  @ApiPropertyOptional({ type: AssignedGroomSummaryDto, nullable: true })
  groom?: AssignedGroomSummaryDto | null;

  @Expose()
  @ApiProperty({ format: 'date-time' })
  startAt!: Date;

  @Expose()
  @ApiPropertyOptional({ format: 'date-time', nullable: true })
  endAt!: Date | null;
}
