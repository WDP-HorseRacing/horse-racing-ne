import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional } from 'class-validator';

export class HorseWorkloadQueryDto {
  @ApiPropertyOptional({
    format: 'date',
    description: 'Từ ngày (lịch CLB); bỏ trống là 6 ngày trước `to`',
  })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({
    format: 'date',
    description: 'Tới ngày (lịch CLB); bỏ trống là hôm nay',
  })
  @IsOptional()
  @IsDateString()
  to?: string;
}

export class WorkloadByIntensityDto {
  @ApiProperty()
  LIGHT!: number;

  @ApiProperty()
  MODERATE!: number;

  @ApiProperty()
  HEAVY!: number;
}

export class HorseWorkloadDto {
  @ApiProperty({ format: 'uuid' })
  horseId!: string;

  @ApiProperty({ format: 'date' })
  from!: string;

  @ApiProperty({ format: 'date' })
  to!: string;

  @ApiProperty({ description: 'Số lượt tập đã hoàn thành' })
  sessionsCompleted!: number;

  @ApiProperty({
    type: WorkloadByIntensityDto,
    description: 'Số lượt hoàn thành theo cường độ buổi',
  })
  byIntensity!: WorkloadByIntensityDto;

  @ApiProperty({ description: 'Tổng cự ly dự kiến (mét)' })
  plannedDistanceM!: number;

  @ApiProperty({
    description: 'Tổng thời lượng thực, từ bắt đầu tới hoàn thành (giây)',
  })
  actualDurationSeconds!: number;

  @ApiProperty({ description: 'Tổng cự ly thực tính từ tốc độ cảm biến (mét)' })
  actualDistanceM!: number;
}
