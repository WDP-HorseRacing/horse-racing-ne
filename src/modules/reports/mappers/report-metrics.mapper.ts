import { averageDecimal, roundDecimal } from '../../../common/utils/decimal';
import { SPEED_SCALE } from '../../performance/constants/performance.constants';
import type { ReportWeekDto } from '../dto/report-week.dto';
import type { MetricGroupRow } from '../types/report.types';

type WeekCount = { weekStart: string; count: number };

/**
 * Dựng biểu đồ tuần từ số lượt hoàn thành, số lượt dừng sớm và tổng hợp điểm đo theo tuần
 *
 * @param completed Số lượt hoàn thành, mỗi dòng một tuần (một tuần có thể có nhiều dòng, được cộng dồn)
 * @param stopped Số lượt dừng sớm, cùng dạng với completed
 * @param metricsByWeek Tổng hợp điểm đo theo tuần
 * @returns Các tuần có lượt hoàn thành, lượt dừng sớm hoặc có điểm đo, sắp theo tuần
 */
export function toWeeks(
  completed: WeekCount[],
  stopped: WeekCount[],
  metricsByWeek: MetricGroupRow[],
): ReportWeekDto[] {
  const metricsOfWeek = new Map(
    metricsByWeek.map((group) => [group.key, group]),
  );
  const weeks = [
    ...new Set([
      ...completed.map((row) => row.weekStart),
      ...stopped.map((row) => row.weekStart),
      ...metricsOfWeek.keys(),
    ]),
  ].sort();
  return weeks.map((weekStart) => {
    const figures = metricFigures(metricsOfWeek.get(weekStart));
    return {
      weekStart,
      completed: countInWeek(completed, weekStart),
      stopped: countInWeek(stopped, weekStart),
      avgHeartRateBpm: figures.avgHeartRateBpm,
      avgSpeedMps: figures.avgSpeedMps,
      alertCount: figures.alertCount,
    };
  });
}

/**
 * Đổi một nhóm điểm đo thành các chỉ số hiển thị
 *
 * @param group Nhóm điểm đo, hoặc undefined nếu không có điểm đo
 * @returns Nhịp tim, tốc độ trung bình và cao nhất, số cảnh báo; không có điểm đo thì các chỉ số là null, cảnh báo là 0
 */
export function metricFigures(group: MetricGroupRow | undefined) {
  if (!group || group.count === 0) {
    return {
      avgHeartRateBpm: null,
      maxHeartRateBpm: null,
      avgSpeedMps: null,
      maxSpeedMps: null,
      alertCount: 0,
    };
  }
  return {
    avgHeartRateBpm: Number(
      averageDecimal(String(group.sumHeartRateBpm), group.count, 0),
    ),
    maxHeartRateBpm: group.maxHeartRateBpm,
    avgSpeedMps: Number(
      averageDecimal(group.sumSpeedMps, group.count, SPEED_SCALE),
    ),
    maxSpeedMps: Number(roundDecimal(group.maxSpeedMps, SPEED_SCALE)),
    alertCount: group.alertCount,
  };
}

/**
 * Cộng số lượt của một tuần
 *
 * @param rows Số lượt theo tuần, một tuần có thể có nhiều dòng
 * @param weekStart Thứ Hai đầu tuần cần cộng
 * @returns Tổng số lượt của tuần
 */
function countInWeek(rows: WeekCount[], weekStart: string): number {
  return rows
    .filter((row) => row.weekStart === weekStart)
    .reduce((sum, row) => sum + row.count, 0);
}
