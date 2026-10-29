import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { DomainEventPublisher } from '../../../common/infrastructure/events/domain-event.publisher';
import type { Actor } from '../../../common/types/actor';
import { roundDecimal } from '../../../common/utils/decimal';
import { deterministicUuid } from '../../../common/utils/deterministic-uuid';
import { RealtimeGateway } from '../../realtime/realtime.gateway';
import type { SessionParticipantEntity } from '../../training/entities/session-participant.entity';
import { TrainingAccessService } from '../../training/shared/training-access.service';
import {
  DEFAULT_THRESHOLD_LIMITS,
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
  highestAlertLevel,
  isPlausibleMetric,
  uniqueBySourceAndTime,
} from '../policies/performance.policy';
import type {
  ClassifiedMetric,
  PerformanceMetricCriticalEvent,
} from '../types/performance.types';
import { PerformanceMetricsRepository } from './performance-metrics.repository';

/**
 * Nhận điểm đo nhịp tim/tốc độ từ thiết bị (hoặc script giả lập) cho một lượt tập
 */
@Injectable()
export class PerformanceMetricsService {
  constructor(
    private readonly metrics: PerformanceMetricsRepository,
    private readonly trainingAccess: TrainingAccessService,
    private readonly events: DomainEventPublisher,
    private readonly realtime: RealtimeGateway,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Lưu các điểm đo của một lượt tập đang diễn ra và báo cho Head Trainer của lớp
   *
   * - Không kiểm danh tính người gửi
   * - Điểm đo không hợp lệ (tốc độ quá trần, thời điểm đo ngoài lượt tập) bị bỏ, không lưu và không chấm cảnh báo
   * - Điểm đo trùng cảm biến và thời điểm đo (trong lô hoặc đã lưu trước đó) bị bỏ qua
   * - Mỗi điểm được chấm mức cảnh báo theo ngưỡng chung của CLB
   * - Điểm mới lưu được đẩy qua socket tới Head Trainer của lớp; lớp chưa có Head Trainer thì không đẩy
   * - Lô có điểm CRITICAL thì ghi event vào outbox; mỗi lượt tập chỉ sinh một thông báo
   *
   * @param participantId UUID của lượt tập
   * @param metrics Các điểm đo gửi lên
   * @returns Promise trả về số điểm đã lưu, số điểm trùng và số điểm không hợp lệ bị bỏ qua, mức cảnh báo cao nhất
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
    const now = new Date();
    const plausible = metrics.filter((metric) =>
      isPlausibleMetric(
        { recordedAt: new Date(metric.recordedAt), speedMps: metric.speedMps },
        participant.startedAt,
        now,
      ),
    );
    const classified = plausible.map((metric): ClassifiedMetric => ({
      sourceId: metric.sourceId,
      recordedAt: new Date(metric.recordedAt),
      heartRateBpm: metric.heartRateBpm,
      speedMps: roundDecimal(String(metric.speedMps), SPEED_SCALE),
      alertLevel: classifyMetric(
        metric.heartRateBpm,
        metric.speedMps,
        DEFAULT_THRESHOLD_LIMITS,
      ),
    }));
    const fresh = await this.metrics.findUnstored(
      participantId,
      uniqueBySourceAndTime(classified),
    );
    await this.metrics.insertForParticipant(participant, fresh);
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
            speedMps: Number(point.speedMps),
            alertLevel: point.alertLevel,
          })),
        },
      );
    }
    return {
      accepted: fresh.length,
      skippedDuplicates: plausible.length - fresh.length,
      skippedInvalid: metrics.length - plausible.length,
      highestAlertLevel: highestAlertLevel(fresh),
    };
  }

  /**
   * Lấy các điểm đo mới nhất của một lượt tập theo thứ tự thời gian
   *
   * - Lượt có nhiều hơn PARTICIPANT_METRIC_LIMIT điểm: bỏ các điểm cũ nhất, giữ các điểm mới nhất
   * - Club Manager, bác sĩ, Groom được giao lượt, Head Trainer của lớp (ngựa thuộc khu mình) xem được
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param participantId UUID của lượt tập
   * @returns Promise trả về tối đa PARTICIPANT_METRIC_LIMIT điểm đo mới nhất, xếp cũ nhất trước
   * @throws ForbiddenException Nếu tài khoản không hoạt động
   * @throws NotFoundException Nếu không có lượt tập hoặc người gọi không được xem
   */
  async list(
    actor: Actor,
    participantId: string,
  ): Promise<PerformanceMetricPointDto[]> {
    await this.trainingAccess.assertCanReadParticipant(actor, participantId);
    return (await this.metrics.listForParticipant(participantId)).map(
      toMetricPoint,
    );
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
    const aggregate = await this.metrics.summarizeParticipant(participantId);
    return toParticipantPerformanceSummary(participantId, aggregate);
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
