import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import { NORMAL_ALERT_LEVEL } from '../constants/performance.constants';

/**
 * Định danh một chuỗi đo (metaField của time-series): một cảm biến trong một lượt tập của một con ngựa.
 */
@Schema({ _id: false })
export class PerformanceMetricMeta {
  @Prop({ type: String, required: true })
  horseId!: string;

  @Prop({ type: String, required: true })
  sessionParticipantId!: string;

  @Prop({ type: String, required: true })
  sessionId!: string;

  @Prop({ type: String, required: true })
  sourceId!: string;
}

/**
 * Một điểm đo hiệu suất từ cảm biến, lưu ở time-series collection `performance_metrics`.
 *
 * - timeField là recordedAt, metaField là meta, granularity seconds
 * - speedMps lưu Decimal128, cộng dồn không sai số
 */
@Schema({
  collection: 'performance_metrics',
  versionKey: false,
  timeseries: {
    timeField: 'recordedAt',
    metaField: 'meta',
    granularity: 'seconds',
  },
})
export class PerformanceMetric {
  @Prop({ type: Date, required: true })
  recordedAt!: Date;

  @Prop({ type: PerformanceMetricMeta, required: true })
  meta!: PerformanceMetricMeta;

  @Prop({ type: Number, required: true })
  heartRateBpm!: number;

  @Prop({ type: Types.Decimal128, required: true })
  speedMps!: Types.Decimal128;

  @Prop({ type: String, required: true, default: NORMAL_ALERT_LEVEL })
  alertLevel!: string;
}

export const PerformanceMetricSchema =
  SchemaFactory.createForClass(PerformanceMetric);

PerformanceMetricSchema.index(
  { 'meta.horseId': 1, recordedAt: -1 },
  { name: 'performance_metrics_horse_recorded_idx' },
);
