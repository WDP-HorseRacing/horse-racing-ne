import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional } from 'class-validator';
import { IsDateOnly } from '../../../common/utils/dto-input';

export class HorseWorkloadQueryDto {
  @ApiPropertyOptional({
    format: 'date',
    description: 'Từ ngày (lịch CLB); bỏ trống là 6 ngày trước `to`',
  })
  @IsOptional()
  @IsDateOnly()
  from?: string;

  @ApiPropertyOptional({
    format: 'date',
    description: 'Tới ngày (lịch CLB); bỏ trống là hôm nay',
  })
  @IsOptional()
  @IsDateOnly()
  to?: string;
}

export class WorkloadByIntensityDto {
  @ApiProperty()
  LIGHT!: number;

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

  @ApiProperty({ description: 'Số lượt tập dừng sớm' })
  sessionsStopped!: number;

  @ApiProperty({
    type: WorkloadByIntensityDto,
    description: 'Số lượt hoàn thành theo cường độ buổi',
  })
  byIntensity!: WorkloadByIntensityDto;

  @ApiProperty({
    description: 'Tổng cự ly dự kiến của các lượt hoàn thành (mét)',
  })
  plannedDistanceM!: number;

  @ApiProperty({
    description:
      'Tổng thời lượng thực của các lượt hoàn thành và dừng sớm, từ bắt đầu tới kết thúc lượt (giây)',
  })
  actualDurationSeconds!: number;

  @ApiProperty({
    description:
      'Tổng cự ly thực của các lượt hoàn thành và dừng sớm, tính từ tốc độ cảm biến (mét)',
  })
  actualDistanceM!: number;
}
