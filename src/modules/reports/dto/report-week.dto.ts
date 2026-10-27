import { ApiProperty } from '@nestjs/swagger';

export class ReportWeekDto {
  @ApiProperty({ format: 'date', description: 'Thứ Hai đầu tuần (lịch CLB)' })
  weekStart!: string;

  @ApiProperty({ description: 'Số lượt hoàn thành trong tuần' })
  completed!: number;

  @ApiProperty({ description: 'Số lượt dừng sớm trong tuần' })
  stopped!: number;

  @ApiProperty({
    type: Number,
    nullable: true,
    description: 'Nhịp tim trung bình (bpm); null khi không có điểm đo',
  })
  avgHeartRateBpm!: number | null;

  @ApiProperty({
    type: Number,
    nullable: true,
    description: 'Tốc độ trung bình (m/s); null khi không có điểm đo',
  })
  avgSpeedMps!: number | null;

  @ApiProperty({ description: 'Số điểm đo vượt ngưỡng (WARNING, CRITICAL)' })
  alertCount!: number;
}
