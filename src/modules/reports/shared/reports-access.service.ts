import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model, Types } from 'mongoose';
import { CLUB_TIME_ZONE } from '../../../common/constants/club.constants';
import { MetricAlertLevel } from '../../performance/enums/metric-alert-level.enum';
import { PerformanceMetric } from '../../performance/schemas/performance-metric.schema';
import type { MetricGroupRow, ReportPeriod } from '../types/report.types';

/**
 * Khóa nhóm điểm đo: theo ngựa, theo lượt tập, hoặc theo tuần (lịch CLB, bắt đầu thứ Hai)
 */
export type MetricGrouping = 'HORSE' | 'PARTICIPANT' | 'WEEK';

const GROUP_KEYS: Record<MetricGrouping, string | Record<string, unknown>> = {
  HORSE: '$meta.horseId',
  PARTICIPANT: '$meta.sessionParticipantId',
  WEEK: {
    $dateToString: {
      format: '%Y-%m-%d',
      timezone: CLUB_TIME_ZONE,
      date: {
        $dateTrunc: {
          date: '$recordedAt',
          unit: 'week',
          timezone: CLUB_TIME_ZONE,
          startOfWeek: 'monday',
        },
      },
    },
  },
};

/**
 * Đọc dùng chung cho các báo cáo: tổng hợp điểm đo nhịp tim, tốc độ từ MongoDB
 */
@Injectable()
export class ReportsAccessService {
  constructor(
    @InjectModel(PerformanceMetric.name)
    private readonly metrics: Model<PerformanceMetric>,
  ) {}

  /**
   * Gộp điểm đo của các ngựa trong kỳ theo một cách nhóm
   *
   * - Điểm đo vượt ngưỡng là điểm có mức khác NORMAL
   *
   * @param horseIds UUID các ngựa
   * @param period Khoảng ngày của báo cáo
   * @param grouping Nhóm theo ngựa, theo lượt tập hoặc theo tuần
   * @returns Promise trả về các nhóm có điểm đo; key là horseId, sessionParticipantId hoặc ngày thứ Hai đầu tuần (YYYY-MM-DD); danh sách ngựa rỗng thì trả mảng rỗng
   */
  async groupMetrics(
    horseIds: string[],
    period: ReportPeriod,
    grouping: MetricGrouping,
  ): Promise<MetricGroupRow[]> {
    if (horseIds.length === 0) return [];
    const groups = await this.metrics.aggregate<{
      _id: string;
      count: number;
      sumHeartRateBpm: number;
      maxHeartRateBpm: number;
      sumSpeedMps: Types.Decimal128;
      maxSpeedMps: Types.Decimal128;
      alertCount: number;
    }>([
      {
        $match: {
          'meta.horseId': { $in: horseIds },
          recordedAt: { $gte: period.start, $lt: period.end },
        },
      },
      {
        $group: {
          _id: GROUP_KEYS[grouping],
          count: { $sum: 1 },
          sumHeartRateBpm: { $sum: '$heartRateBpm' },
          maxHeartRateBpm: { $max: '$heartRateBpm' },
          sumSpeedMps: { $sum: '$speedMps' },
          maxSpeedMps: { $max: '$speedMps' },
          alertCount: {
            $sum: {
              $cond: [{ $ne: ['$alertLevel', MetricAlertLevel.NORMAL] }, 1, 0],
            },
          },
        },
      },
    ]);
    return groups.map((group) => ({
      key: group._id,
      count: group.count,
      sumHeartRateBpm: group.sumHeartRateBpm,
      maxHeartRateBpm: group.maxHeartRateBpm,
      sumSpeedMps: group.sumSpeedMps.toString(),
      maxSpeedMps: group.maxSpeedMps.toString(),
      alertCount: group.alertCount,
    }));
  }
}
