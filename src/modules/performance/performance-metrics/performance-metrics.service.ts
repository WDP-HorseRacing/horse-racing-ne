import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { DataSource } from 'typeorm';
import { DomainEventPublisher } from '../../../common/infrastructure/events/domain-event.publisher';
import type { Actor } from '../../../common/types/actor';
import { roundDecimal } from '../../../common/utils/decimal';
import { deterministicUuid } from '../../../common/utils/deterministic-uuid';
import { RealtimeGateway } from '../../realtime/realtime.gateway';
import type { SessionParticipantEntity } from '../../training/entities/session-participant.entity';
import { TrainingAccessService } from '../../training/shared/training-access.service';
import {
  PARTICIPANT_METRIC_LIMIT,
  PERFORMANCE_METRIC_CRITICAL_EVENT,
  PERFORMANCE_METRICS_SOCKET_EVENT,
  SPEED_SCALE,
} from '../constants/performance.constants';
import {
  ParticipantPerformanceSummaryDto,
  PerformanceMetricPointDto,
} from '../dto/horse-performance.response.dto';
import { IngestMetricsResultDto } from '../dto/ingest-metric-batch.dto';
import { IngestMetricDto } from '../dto/ingest-metric.dto';
import { MetricAlertLevel } from '../enums/metric-alert-level.enum';
import {
  toMetricPoint,
  toParticipantPerformanceSummary,
} from '../mappers/performance.mapper';
import {
  assertParticipantRecording,
  classifyMetric,
} from '../policies/performance.policy';
import { PerformanceMetric } from '../schemas/performance-metric.schema';
import { PerformanceAccessService } from '../shared/performance-access.service';
import type {
  ClassifiedMetric,
  ParticipantMetricAggregate,
  PerformanceMetricCriticalEvent,
} from '../types/performance.types';

const ALERT_RANK: Record<MetricAlertLevel, number> = {
  [MetricAlertLevel.NORMAL]: 0,
  [MetricAlertLevel.WARNING]: 1,
  [MetricAlertLevel.CRITICAL]: 2,
};

/**
 * Nhận điểm đo nhịp tim/tốc độ từ thiết bị (hoặc script giả lập) cho một lượt tập
 */
@Injectable()
export class PerformanceMetricsService {
  constructor(
    @InjectModel(PerformanceMetric.name)
    private readonly metrics: Model<PerformanceMetric>,
    private readonly trainingAccess: TrainingAccessService,
    private readonly performanceAccess: PerformanceAccessService,
    private readonly events: DomainEventPublisher,
    private readonly realtime: RealtimeGateway,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Lưu các điểm đo của một lượt tập đang diễn ra và báo cho Head Trainer của lớp
   *
   * - Không kiểm danh tính người gửi
   * - Điểm đo trùng cảm biến và thời điểm đo (trong lô hoặc đã lưu trước đó) bị bỏ qua
   * - Mỗi điểm được chấm mức cảnh báo theo ngưỡng đang áp cho con ngựa
   * - Điểm mới lưu được đẩy qua socket tới Head Trainer của lớp; lớp chưa có Head Trainer thì không đẩy
   * - Lô có điểm CRITICAL thì ghi event vào outbox; mỗi lượt tập chỉ sinh một thông báo
   *
   * @param participantId UUID của lượt tập
   * @param metrics Các điểm đo gửi lên
   * @returns Promise trả về số điểm đã lưu, số điểm trùng bị bỏ qua và mức cảnh báo cao nhất
   * @throws NotFoundException Nếu không có lượt tập
   * @throws ConflictException Nếu lượt tập không ở ONGOING
   */
  async ingest(
    participantId: string,
    metrics: IngestMetricDto[],
  ): Promise<IngestMetricsResultDto> {
    const participant = await this.trainingAccess.findParticipant(
      this.dataSource.manager,
      participantId,
    );
    assertParticipantRecording(participant.status);
    const { limits } = await this.performanceAccess.activeThreshold(
      participant.horseId,
      new Date(),
    );
    const classified = metrics.map((metric): ClassifiedMetric => ({
      sourceId: metric.sourceId,
      recordedAt: new Date(metric.recordedAt),
      heartRateBpm: metric.heartRateBpm,
      speedMps: roundDecimal(String(metric.speedMps), SPEED_SCALE),
      alertLevel: classifyMetric(metric.heartRateBpm, metric.speedMps, limits),
    }));
    const fresh = await this.withoutStored(
      participantId,
      uniqueBySourceAndTime(classified),
    );
    if (fresh.length > 0) {
      await this.metrics.insertMany(
        fresh.map((point) => ({
          recordedAt: point.recordedAt,
          meta: {
            horseId: participant.horseId,
            sessionParticipantId: participant.id,
            sessionId: participant.sessionId,
            sourceId: point.sourceId,
          },
          heartRateBpm: point.heartRateBpm,
          speedMps: Types.Decimal128.fromString(point.speedMps),
          alertLevel: point.alertLevel,
        })),
      );
    }
    const critical = classified.find(
      (point) => point.alertLevel === MetricAlertLevel.CRITICAL,
    );
    if (critical) {
      await this.publishCritical(participant, critical);
    }
    const headTrainerId = participant.session.trainingClass.headTrainerId;
    if (fresh.length > 0 && headTrainerId) {
      this.realtime.emitToUser(
        headTrainerId,
        PERFORMANCE_METRICS_SOCKET_EVENT,
        {
          sessionParticipantId: participant.id,
          sessionId: participant.sessionId,
          horseId: participant.horseId,
          points: fresh.map((point) => ({
            recordedAt: point.recordedAt.toISOString(),
            heartRateBpm: point.heartRateBpm,
            speedMps: point.speedMps,
            alertLevel: point.alertLevel,
          })),
        },
      );
    }
    return {
      accepted: fresh.length,
      skippedDuplicates: metrics.length - fresh.length,
      highestAlertLevel: highestAlertLevel(fresh),
    };
  }

  /**
   * Lấy các điểm đo của một lượt tập theo thứ tự thời gian
   *
   * - Club Manager, bác sĩ, Groom được giao lượt, Head Trainer của lớp (ngựa thuộc khu mình) xem được
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param participantId UUID của lượt tập
   * @returns Promise trả về tối đa PARTICIPANT_METRIC_LIMIT điểm đo, cũ nhất trước
   * @throws ForbiddenException Nếu tài khoản không hoạt động
   * @throws NotFoundException Nếu không có lượt tập hoặc người gọi không được xem
   */
  async list(
    actor: Actor,
    participantId: string,
  ): Promise<PerformanceMetricPointDto[]> {
    await this.trainingAccess.assertCanReadParticipant(actor, participantId);
    const rows = await this.metrics
      .find({ 'meta.sessionParticipantId': participantId })
      .sort({ recordedAt: 1 })
      .limit(PARTICIPANT_METRIC_LIMIT)
      .lean<PerformanceMetric[]>()
      .exec();
    return rows.map(toMetricPoint);
  }

  /**
   * Tổng kết chỉ số nhịp tim, tốc độ và số cảnh báo của một lượt tập
   *
   * - Ai xem được lượt tập thì xem được tổng kết, kể cả chủ ngựa
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param participantId UUID của lượt tập
   * @returns Promise trả về tổng kết; lượt chưa có điểm đo thì count 0 và các chỉ số null
   * @throws ForbiddenException Nếu tài khoản không hoạt động
   * @throws NotFoundException Nếu không có lượt tập hoặc người gọi không được xem
   */
  async summary(
    actor: Actor,
    participantId: string,
  ): Promise<ParticipantPerformanceSummaryDto> {
    await this.trainingAccess.assertCanReadParticipant(actor, participantId);
    const [group] = await this.metrics.aggregate<{
      count: number;
      sumHeartRateBpm: number;
      maxHeartRateBpm: number;
      sumSpeedMps: Types.Decimal128;
      maxSpeedMps: Types.Decimal128;
      warningCount: number;
      criticalCount: number;
      firstRecordedAt: Date;
      lastRecordedAt: Date;
    }>([
      { $match: { 'meta.sessionParticipantId': participantId } },
      {
        $group: {
          _id: null,
          count: { $sum: 1 },
          sumHeartRateBpm: { $sum: '$heartRateBpm' },
          maxHeartRateBpm: { $max: '$heartRateBpm' },
          sumSpeedMps: { $sum: '$speedMps' },
          maxSpeedMps: { $max: '$speedMps' },
          warningCount: {
            $sum: {
              $cond: [{ $eq: ['$alertLevel', MetricAlertLevel.WARNING] }, 1, 0],
            },
          },
          criticalCount: {
            $sum: {
              $cond: [
                { $eq: ['$alertLevel', MetricAlertLevel.CRITICAL] },
                1,
                0,
              ],
            },
          },
          firstRecordedAt: { $min: '$recordedAt' },
          lastRecordedAt: { $max: '$recordedAt' },
        },
      },
    ]);
    const aggregate: ParticipantMetricAggregate | null = group
      ? {
          ...group,
          sumSpeedMps: group.sumSpeedMps.toString(),
          maxSpeedMps: group.maxSpeedMps.toString(),
        }
      : null;
    return toParticipantPerformanceSummary(participantId, aggregate);
  }

  /**
   * Bỏ các điểm đo đã lưu trước đó (cùng lượt tập, cùng cảm biến, cùng thời điểm đo)
   *
   * @param participantId UUID của lượt tập
   * @param points Các điểm đo đã bỏ trùng trong lô
   * @returns Promise trả về các điểm đo chưa có trong collection
   */
  private async withoutStored(
    participantId: string,
    points: ClassifiedMetric[],
  ): Promise<ClassifiedMetric[]> {
    if (points.length === 0) return [];
    const stored = await this.metrics
      .find(
        {
          'meta.sessionParticipantId': participantId,
          recordedAt: { $in: points.map((point) => point.recordedAt) },
        },
        { recordedAt: 1, 'meta.sourceId': 1 },
      )
      .lean<Array<{ recordedAt: Date; meta: { sourceId: string } }>>();
    const storedKeys = new Set(
      stored.map((row) => metricKey(row.meta.sourceId, row.recordedAt)),
    );
    return points.filter(
      (point) => !storedKeys.has(metricKey(point.sourceId, point.recordedAt)),
    );
  }

  /**
   * Ghi event điểm đo vượt ngưỡng nguy hiểm vào outbox
   *
   * - eventId cố định theo lượt tập nên các lô sau của cùng lượt không sinh thêm thông báo
   *
   * @param participant Lượt tập kèm buổi, giáo án và lớp
   * @param critical Điểm đo CRITICAL đầu tiên trong lô
   * @returns Promise hoàn tất khi đã ghi vào outbox
   */
  private async publishCritical(
    participant: SessionParticipantEntity,
    critical: ClassifiedMetric,
  ): Promise<void> {
    const event: PerformanceMetricCriticalEvent = {
      eventId: deterministicUuid(`performance-critical:${participant.id}`),
      horseId: participant.horseId,
      sessionId: participant.sessionId,
      sessionParticipantId: participant.id,
      headTrainerId: participant.session.trainingClass.headTrainerId,
      heartRateBpm: critical.heartRateBpm,
      speedMps: critical.speedMps,
      recordedAt: critical.recordedAt.toISOString(),
    };
    await this.events.publish(
      this.dataSource.manager,
      PERFORMANCE_METRIC_CRITICAL_EVENT,
      event,
    );
  }
}

/**
 * Bỏ các điểm đo trùng cảm biến và thời điểm đo trong cùng một lô, giữ điểm đầu tiên
 *
 * @param points Các điểm đo trong lô
 * @returns Các điểm đo không trùng, giữ thứ tự gửi lên
 */
function uniqueBySourceAndTime(points: ClassifiedMetric[]): ClassifiedMetric[] {
  const seen = new Set<string>();
  return points.filter((point) => {
    const key = metricKey(point.sourceId, point.recordedAt);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Tạo khóa chống trùng của một điểm đo
 *
 * @param sourceId Mã cảm biến
 * @param recordedAt Thời điểm đo
 * @returns Chuỗi khóa ghép cảm biến và thời điểm đo
 */
function metricKey(sourceId: string, recordedAt: Date): string {
  return `${sourceId}|${recordedAt.toISOString()}`;
}

/**
 * Lấy mức cảnh báo cao nhất trong các điểm đo
 *
 * @param points Các điểm đo
 * @returns Mức cao nhất, NORMAL nếu không có điểm nào
 */
function highestAlertLevel(points: ClassifiedMetric[]): MetricAlertLevel {
  return points.reduce(
    (highest, point) =>
      ALERT_RANK[point.alertLevel] > ALERT_RANK[highest]
        ? point.alertLevel
        : highest,
    MetricAlertLevel.NORMAL,
  );
}
