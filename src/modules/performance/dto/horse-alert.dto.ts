import { ApiProperty, ApiPropertyOptional, PickType } from '@nestjs/swagger';
import { IsDateString, IsIn, IsOptional } from 'class-validator';
import { PaginationMetaDto } from '../../../common/dto/pagination-response.dto';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { MetricAlertLevel } from '../enums/metric-alert-level.enum';

export class HorseAlertQueryDto extends PickType(PaginationQueryDto, [
  'page',
  'limit',
] as const) {
  @ApiPropertyOptional({
    enum: [MetricAlertLevel.WARNING, MetricAlertLevel.CRITICAL],
    description: 'Chỉ lấy một mức; bỏ trống là cả WARNING và CRITICAL',
  })
  @IsOptional()
  @IsIn([MetricAlertLevel.WARNING, MetricAlertLevel.CRITICAL])
  level?: MetricAlertLevel.WARNING | MetricAlertLevel.CRITICAL;

  @ApiPropertyOptional({ format: 'date', description: 'Từ ngày (lịch CLB)' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({
    format: 'date',
    description: 'Tới hết ngày (lịch CLB)',
  })
  @IsOptional()
  @IsDateString()
  to?: string;
}

export class HorseAlertDto {
  @ApiProperty({ format: 'date-time' })
  recordedAt!: Date;

  @ApiProperty()
  heartRateBpm!: number;

  @ApiProperty({ description: 'Tốc độ (m/s), 3 chữ số thập phân' })
  speedMps!: string;

  @ApiProperty({ enum: [MetricAlertLevel.WARNING, MetricAlertLevel.CRITICAL] })
  alertLevel!: MetricAlertLevel;

  @ApiProperty({ format: 'uuid' })
  sessionParticipantId!: string;

  @ApiProperty({ format: 'uuid' })
  sessionId!: string;

  @ApiPropertyOptional({
    nullable: true,
    description: 'Tên buổi tập, null nếu buổi không còn',
  })
  sessionName!: string | null;
}

export class HorseAlertPageDto {
  @ApiProperty({ type: [HorseAlertDto] })
  items!: HorseAlertDto[];

  @ApiProperty({ type: PaginationMetaDto })
  meta!: PaginationMetaDto;
}
