import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';
import { IsUUID } from 'class-validator';

export class AssignGroomDto {
  @ApiProperty({ format: 'uuid', description: 'ID groom phụ trách' })
  @IsUUID()
  groomId!: string;
}

export class AssignedGroomSummaryDto {
  @Expose()
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @Expose()
  @ApiProperty()
  fullName!: string;

  @Expose()
  @ApiProperty()
  email!: string;
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

export class GroomWorkloadResponseDto {
  @Expose()
  @ApiProperty({ format: 'uuid' })
  groomId!: string;

  @Expose()
  @ApiProperty()
  fullName!: string;

  @Expose()
  @ApiProperty({
    description: 'Số ngựa (chưa xóa) groom đang phụ trách trên toàn câu lạc bộ',
  })
  activeHorseCount!: number;
}
