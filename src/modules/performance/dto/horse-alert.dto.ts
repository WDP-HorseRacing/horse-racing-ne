import { ApiProperty, ApiPropertyOptional, PickType } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';
import { PaginationMetaDto } from '../../../common/dto/pagination-response.dto';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { MetricAlertLevel } from '../enums/metric-alert-level.enum';
import { IsDateOnly } from '../../../common/utils/dto-input';

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
  @IsDateOnly()
  from?: string;

  @ApiPropertyOptional({
    format: 'date',
    description: 'Tới hết ngày (lịch CLB)',
  })
  @IsOptional()
  @IsDateOnly()
  to?: string;
}

export class HorseAlertDto {
  @ApiProperty({ format: 'date-time' })
  recordedAt!: Date;

  @ApiProperty()
  heartRateBpm!: number;

  @ApiProperty({
    type: Number,
    description: 'Tốc độ (m/s), làm tròn tối đa 3 chữ số thập phân',
  })
  speedMps!: number;

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
